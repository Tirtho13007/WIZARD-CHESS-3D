import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Minimal pure-JS PNG encoder using Node's built-in zlib
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgbaData.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend),
  ]);
}

function drawChessIcon(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  // Safe zone scale: maskable uses 0.76 scale so all elements sit well inside central 80% circle
  const scale = isMaskable ? 0.74 : 0.92;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Normalized coordinates [-1, 1]
      const nx = (x - cx) / (size / 2);
      const ny = (y - cy) / (size / 2);
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Dark Sanctum radial gradient background
      const vignette = Math.max(0, 1 - dist * 0.65);
      let r = Math.round(8 + vignette * 18);
      let g = Math.round(10 + vignette * 22);
      let b = Math.round(15 + vignette * 34);

      // Scaled coordinates for king emblem
      const sx = nx / scale;
      const sy = ny / scale;
      const sdist = Math.sqrt(sx * sx + sy * sy);

      // Gold decorative ring
      const onOuterRing = Math.abs(sdist - 0.82) < 0.025;
      const onInnerRing = Math.abs(sdist - 0.74) < 0.012;

      // King Crown geometry in sx, sy [-1, 1]
      // 1. Cross at top: sy in [-0.68, -0.34]
      const inCrossVert = Math.abs(sx) < 0.055 && sy >= -0.68 && sy <= -0.32;
      const inCrossHoriz = Math.abs(sx) < 0.16 && sy >= -0.57 && sy <= -0.46;

      // 2. Crown jewel arch & body: sy in [-0.32, 0.25]
      const crownHalfWidth = 0.28 + (0.25 - sy) * 0.22; // wider at top
      const inCrownBody =
        sy >= -0.26 &&
        sy <= 0.24 &&
        Math.abs(sx) <= crownHalfWidth &&
        sy >= -0.26 + Math.sin(sx * 16) * 0.06;

      // 3. Pedestal collar & base steps: sy in [0.28, 0.66]
      const inCollar = sy >= 0.28 && sy <= 0.37 && Math.abs(sx) <= 0.34;
      const inBase1 = sy >= 0.41 && sy <= 0.52 && Math.abs(sx) <= 0.43;
      const inBase2 = sy >= 0.56 && sy <= 0.66 && Math.abs(sx) <= 0.52;

      const isGoldShape =
        onOuterRing ||
        onInnerRing ||
        inCrossVert ||
        inCrossHoriz ||
        inCrownBody ||
        inCollar ||
        inBase1 ||
        inBase2;

      if (isGoldShape) {
        // Metallic gold gradient based on sx + sy
        const shine = Math.max(0, Math.min(1, 0.65 - (sx * 0.45 + sy * 0.45)));
        r = Math.round(175 + shine * 75);
        g = Math.round(135 + shine * 85);
        b = Math.round(35 + shine * 75);
      }

      const idx = (y * size + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
  return encodePNG(size, size, buf);
}

function drawScreenshot(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  const cx = width / 2;
  const cy = height * 0.54;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / (width / 2);
      const ny = (y - cy) / (height / 2);
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Cathedral atmospheric background with warm altar glow
      const glow = Math.max(0, 1 - dist * 0.85);
      let r = Math.round(10 + glow * 32);
      let g = Math.round(13 + glow * 28);
      let b = Math.round(20 + glow * 24);

      // Perspective 3D chessboard in center
      if (ny > -0.15 && ny < 0.65) {
        const boardT = (ny + 0.15) / 0.8; // 0 at back, 1 at front
        const halfSpan = 0.28 + boardT * 0.45;
        if (Math.abs(nx) < halfSpan) {
          const bx = (nx + halfSpan) / (2 * halfSpan); // [0, 1]
          const file = Math.floor(bx * 8);
          const rank = Math.floor(boardT * 8);
          const isLight = (file + rank) % 2 === 0;
          if (isLight) {
            r = 185;
            g = 172;
            b = 148;
          } else {
            r = 38;
            g = 44;
            b = 56;
          }
          // Gold border around board
          if (bx < 0.02 || bx > 0.98 || boardT < 0.02 || boardT > 0.98) {
            r = 212;
            g = 175;
            b = 55;
          }
        }
      }

      // Top HUD pill bar preview
      if (y > height * 0.04 && y < height * 0.10 && Math.abs(nx) < 0.82) {
        r = 18;
        g = 22;
        b = 32;
        if (Math.abs(y - height * 0.04) < 2 || Math.abs(y - height * 0.10) < 2) {
          r = 212;
          g = 175;
          b = 55;
        }
      }

      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
  return encodePNG(width, height, buf);
}

const pubDir = path.resolve('public');
fs.mkdirSync(pubDir, { recursive: true });

fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), drawChessIcon(192, false));
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), drawChessIcon(512, false));
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), drawChessIcon(512, true));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), drawChessIcon(180, false));
fs.writeFileSync(path.join(pubDir, 'screenshot-wide.png'), drawScreenshot(1280, 720));
fs.writeFileSync(path.join(pubDir, 'screenshot-narrow.png'), drawScreenshot(720, 1280));

console.log('Generated all PWA icons and screenshots in public/');
