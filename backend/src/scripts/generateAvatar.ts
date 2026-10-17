import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

function generateAvatarPng(width = 512, height = 512): Buffer {
  // 1. Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // 3. Raw RGBA bitmap
  // Canvas drawing: Background #09090b, HUD borders #27272a, Accent #d4ff00
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  const bgR = 9, bgG = 9, bgB = 11;
  const limeR = 212, limeG = 255, limeB = 0;
  const borderR = 45, borderG = 45, borderB = 52;
  const gridR = 20, gridG = 20, gridB = 26;

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * rowSize + 1 + x * 4;
    rawData[offset] = r;
    rawData[offset + 1] = g;
    rawData[offset + 2] = b;
    rawData[offset + 3] = a;
  };

  // Fill background and subtle grid
  for (let y = 0; y < height; y++) {
    rawData[y * rowSize] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      if (x % 32 === 0 || y % 32 === 0) {
        setPixel(x, y, gridR, gridG, gridB, 255);
      } else {
        setPixel(x, y, bgR, bgG, bgB, 255);
      }
    }
  }

  // Draw HUD outer border (sharp 0px, rounded-none)
  const pad = 28;
  for (let x = pad; x < width - pad; x++) {
    setPixel(x, pad, borderR, borderG, borderB);
    setPixel(x, height - pad, borderR, borderG, borderB);
  }
  for (let y = pad; y < height - pad; y++) {
    setPixel(pad, y, borderR, borderG, borderB);
    setPixel(width - pad, y, borderR, borderG, borderB);
  }

  // Corner brackets in neon lime #d4ff00
  const bracketLen = 36;
  const bracketThick = 4;
  for (let t = 0; t < bracketThick; t++) {
    for (let i = 0; i < bracketLen; i++) {
      // Top-Left
      setPixel(pad + i, pad + t, limeR, limeG, limeB);
      setPixel(pad + t, pad + i, limeR, limeG, limeB);
      // Top-Right
      setPixel(width - pad - 1 - i, pad + t, limeR, limeG, limeB);
      setPixel(width - pad - 1 - t, pad + i, limeR, limeG, limeB);
      // Bottom-Left
      setPixel(pad + i, height - pad - 1 - t, limeR, limeG, limeB);
      setPixel(pad + t, height - pad - 1 - i, limeR, limeG, limeB);
      // Bottom-Right
      setPixel(width - pad - 1 - i, height - pad - 1 - t, limeR, limeG, limeB);
      setPixel(width - pad - 1 - t, height - pad - 1 - i, limeR, limeG, limeB);
    }
  }

  // Center Reticle Crosshair (subtle lines)
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let x = pad + 10; x < width - pad - 10; x += 4) {
    if (Math.abs(x - cx) > 130) {
      setPixel(x, cy, borderR, borderG, borderB);
    }
  }
  for (let y = pad + 10; y < height - pad - 10; y += 4) {
    if (Math.abs(y - cy) > 130) {
      setPixel(cx, y, borderR, borderG, borderB);
    }
  }

  // Draw Cyberpunk bold blocky letter 'E'
  // Center is (cx, cy) = (256, 256)
  // Dimensions of 'E':
  // left: 160, right: 350
  // top: 140, bottom: 370
  // vertical bar: x in [160, 215]
  // top bar: y in [140, 195], x in [160, 350]
  // mid bar: y in [230, 280], x in [160, 315]
  // bot bar: y in [315, 370], x in [160, 350]
  for (let y = 140; y <= 370; y++) {
    for (let x = 160; x <= 350; x++) {
      const isVert = x >= 160 && x <= 220;
      const isTop = y >= 140 && y <= 195;
      const isMid = y >= 230 && y <= 280 && x <= 315;
      const isBot = y >= 315 && y <= 370;

      if (isVert || isTop || isMid || isBot) {
        setPixel(x, y, limeR, limeG, limeB);
      }
    }
  }

  // Inner accent line on 'E'
  for (let y = 148; y <= 362; y++) {
    setPixel(168, y, 0, 0, 0);
  }

  // Small telemetry dots and marks
  for (let d = 0; d < 5; d++) {
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        setPixel(pad + 50 + d * 16 + dx, height - pad - 16 + dy, limeR, limeG, limeB);
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#09090b"/>
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.04"/>
    </pattern>
  </defs>
  <rect width="512" height="512" fill="url(#grid)" />
  
  <!-- Outer border -->
  <rect x="28" y="28" width="456" height="456" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.12"/>
  
  <!-- Corner HUD brackets in #d4ff00 -->
  <path d="M 28 64 L 28 28 L 64 28" fill="none" stroke="#d4ff00" stroke-width="4"/>
  <path d="M 448 28 L 484 28 L 484 64" fill="none" stroke="#d4ff00" stroke-width="4"/>
  <path d="M 28 448 L 28 484 L 64 484" fill="none" stroke="#d4ff00" stroke-width="4"/>
  <path d="M 448 484 L 484 484 L 484 448" fill="none" stroke="#d4ff00" stroke-width="4"/>
  
  <!-- Reticle guides -->
  <line x1="40" y1="256" x2="130" y2="256" stroke="#ffffff" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.2"/>
  <line x1="382" y1="256" x2="472" y2="256" stroke="#ffffff" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.2"/>
  <line x1="256" y1="40" x2="256" y2="120" stroke="#ffffff" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.2"/>
  <line x1="256" y1="390" x2="256" y2="472" stroke="#ffffff" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="0.2"/>
  
  <!-- Cyberpunk 'E' Logo -->
  <path d="M 160 140 H 352 V 196 H 224 V 228 H 316 V 284 H 224 V 316 H 352 V 372 H 160 Z" fill="#d4ff00"/>
  <rect x="168" y="148" width="4" height="216" fill="#09090b" opacity="0.4"/>
  
  <!-- Telemetry HUD tags -->
  <text x="40" y="474" font-family="monospace" font-size="10" fill="#d4ff00" letter-spacing="2">EGE.SYSTEM // BOT</text>
  <text x="430" y="474" font-family="monospace" font-size="10" fill="#ffffff" fill-opacity="0.4" text-anchor="end">v2.0</text>
</svg>`;

// Write to public/ and frontend/public/
const targetDirs = [
  path.resolve(process.cwd(), 'public'),
  path.resolve(process.cwd(), 'frontend/public'),
];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const pngBuffer = generateAvatarPng(512, 512);

for (const dir of targetDirs) {
  fs.writeFileSync(path.join(dir, 'bot-avatar.png'), pngBuffer);
  fs.writeFileSync(path.join(dir, 'bot-avatar.svg'), svgContent, 'utf-8');
}

console.log('✅ Generated bot avatar (bot-avatar.png & bot-avatar.svg) in:');
targetDirs.forEach((d) => console.log('   -> ' + d));
