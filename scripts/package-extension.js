const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const version = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")).version;
const outPath = path.join(distDir, `skimroute-${version}.zip`);

const fixedDate = { time: 0, date: ((2024 - 1980) << 9) | (1 << 5) | 1 };
const roots = [
  "manifest.json",
  "popup.html",
  "styles.css",
  "service-worker-loader.js",
  "debug-config.js",
  "assets",
  "node_modules/pdfjs-dist/build",
  "node_modules/pdfjs-dist/cmaps",
  "node_modules/pdfjs-dist/wasm",
  "node_modules/pdfjs-dist/standard_fonts",
  "node_modules/pdfjs-dist/iccs",
  "node_modules/tesseract.js/dist",
  "node_modules/tesseract.js-core",
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int"
];

function collect(relativePath, files) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    fs.readdirSync(absolutePath).forEach((child) => collect(path.join(relativePath, child), files));
    return;
  }
  if (stat.isFile()) files.push(relativePath.replace(/\\/g, "/"));
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function localHeader(nameBuffer, crc, size) {
  return Buffer.concat([
    writeUInt32(0x04034b50),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(fixedDate.time),
    writeUInt16(fixedDate.date),
    writeUInt32(crc),
    writeUInt32(size),
    writeUInt32(size),
    writeUInt16(nameBuffer.length),
    writeUInt16(0),
    nameBuffer
  ]);
}

function centralHeader(nameBuffer, crc, size, offset) {
  return Buffer.concat([
    writeUInt32(0x02014b50),
    writeUInt16(20),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(fixedDate.time),
    writeUInt16(fixedDate.date),
    writeUInt32(crc),
    writeUInt32(size),
    writeUInt32(size),
    writeUInt16(nameBuffer.length),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(0),
    writeUInt32(offset),
    nameBuffer
  ]);
}

function endRecord(fileCount, centralSize, centralOffset) {
  return Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(fileCount),
    writeUInt16(fileCount),
    writeUInt32(centralSize),
    writeUInt32(centralOffset),
    writeUInt16(0)
  ]);
}

const files = [];
roots.forEach((entry) => collect(entry, files));
files.sort();

if (!files.length) throw new Error("No extension files found to package.");
fs.mkdirSync(distDir, { recursive: true });

let offset = 0;
const chunks = [];
const central = [];

files.forEach((relativePath) => {
  const data = fs.readFileSync(path.join(root, relativePath));
  const nameBuffer = Buffer.from(relativePath, "utf8");
  const crc = crc32(data);
  const header = localHeader(nameBuffer, crc, data.length);
  chunks.push(header, data);
  central.push(centralHeader(nameBuffer, crc, data.length, offset));
  offset += header.length + data.length;
});

const centralOffset = offset;
const centralBuffer = Buffer.concat(central);
const output = Buffer.concat([...chunks, centralBuffer, endRecord(files.length, centralBuffer.length, centralOffset)]);
fs.writeFileSync(outPath, output);
console.log(`Packaged ${files.length} files -> ${path.relative(root, outPath)}`);
