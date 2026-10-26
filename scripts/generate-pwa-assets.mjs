import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Pure-JS PNG encoder using Node's built-in zlib
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
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

// ============================================================================
// 3D SDF RAYMARCHER: REALISTIC 3D DARK WIZARD (VOLDEMORT-INSPIRED SORCERER)
// Coordinate System: +X = Right, +Y = Up, +Z = Front (Toward Camera at Z = +2.05)
// ============================================================================

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

function smax(a, b, k) {
  return -smin(-a, -b, k);
}

function sdSphere(px, py, pz, r) {
  return Math.sqrt(px * px + py * py + pz * pz) - r;
}

function sdEllipsoid(px, py, pz, rx, ry, rz) {
  const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
  const k1 = Math.sqrt(
    (px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2
  );
  return (k0 * (k0 - 1.0)) / (k1 + 1e-6);
}

function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax,
    pay = py - ay,
    paz = pz - az;
  const bax = bx - ax,
    bay = by - ay,
    baz = bz - az;
  const dotBA = bax * bax + bay * bay + baz * baz;
  const h = clamp((pax * bax + pay * bay + paz * baz) / dotBA, 0.0, 1.0);
  const dx = pax - bax * h,
    dy = pay - bay * h,
    dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

function sdTorusY(px, py, pz, R, r) {
  const qx = Math.sqrt(px * px + pz * pz) - R;
  return Math.sqrt(qx * qx + py * py) - r;
}

function sdBox(px, py, pz, bx, by, bz) {
  const dx = Math.abs(px) - bx;
  const dy = Math.abs(py) - by;
  const dz = Math.abs(pz) - bz;
  const out = Math.sqrt(
    Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2 + Math.max(dz, 0) ** 2
  );
  const inside = Math.min(Math.max(dx, dy, dz), 0);
  return out + inside;
}

function evaluateScene(px, py, pz) {
  // -------------------------------------------------------------------------
  // 1. SCULPTED 3D VOLDEMORT-STYLE DARK WIZARD HEAD (+Y up, +Z front)
  // -------------------------------------------------------------------------
  const hx = px - 0.03;
  const ahx = Math.abs(hx);
  const hy = py - 0.11;
  const hz = pz;

  // Bald sculpted cranium dome + facial block
  const cranium = sdEllipsoid(hx, hy - 0.16, hz + 0.02, 0.32, 0.34, 0.35);
  const midFace = sdEllipsoid(hx, hy - 0.01, hz - 0.06, 0.255, 0.23, 0.28);
  let head = smin(cranium, midFace, 0.075);

  // Tapered jaw & sharp angular chin
  const jaw = sdCapsule(hx, hy, hz, 0.0, 0.02, 0.06, 0.0, -0.25, 0.18, 0.135);
  const jawAngles = sdCapsule(ahx, hy, hz, 0.20, -0.06, 0.05, 0.035, -0.26, 0.20, 0.058);
  head = smin(head, smin(jaw, jawAngles, 0.055), 0.065);

  // High sharp gaunt cheekbones
  const cheekbone = sdCapsule(ahx, hy, hz, 0.08, 0.01, 0.24, 0.23, 0.05, 0.12, 0.062);
  head = smin(head, cheekbone, 0.05);

  // Deeply carved eye sockets on front (+Z)
  const socket = sdEllipsoid(ahx - 0.112, hy - 0.065, hz - 0.255, 0.082, 0.052, 0.09);
  head = smax(head, -socket, 0.03);

  // Fierce V-shaped furrowed brow ridge overhanging the eye sockets
  const brow = sdCapsule(ahx, hy, hz, 0.015, 0.095, 0.295, 0.215, 0.155, 0.18, 0.044);
  head = smin(head, brow, 0.032);

  // Gaunt sunken cheek hollows below cheekbones
  const cheekHollow = sdEllipsoid(ahx - 0.16, hy + 0.095, hz - 0.205, 0.078, 0.095, 0.075);
  head = smax(head, -cheekHollow, 0.038);

  // Voldemort flat serpentine nasal bone + razor-sharp vertical snake slit nostrils
  const noseBridge = sdCapsule(hx, hy, hz, 0.0, 0.085, 0.275, 0.0, -0.035, 0.305, 0.032);
  head = smin(head, noseBridge, 0.03);
  const nostrilSlit = sdCapsule(
    ahx,
    hy,
    hz,
    0.015,
    0.028,
    0.305,
    0.032,
    -0.036,
    0.302,
    0.0075
  );
  head = smax(head, -nostrilSlit, 0.005);

  // Sinister sculpted thin lips & wide linear mouth seam
  const upperLip = sdCapsule(ahx, hy, hz, 0.0, -0.118, 0.292, 0.095, -0.132, 0.255, 0.022);
  const lowerLip = sdCapsule(ahx, hy, hz, 0.0, -0.148, 0.288, 0.085, -0.152, 0.252, 0.020);
  head = smin(head, smin(upperLip, lowerLip, 0.014), 0.024);
  const mouthCut = sdCapsule(
    ahx,
    hy,
    hz,
    0.0,
    -0.133,
    0.316,
    0.102,
    -0.142,
    0.276,
    0.0085
  );
  head = smax(head, -mouthCut, 0.006);

  // Muscular neck & twin throat tendons
  const neck = sdCapsule(hx, hy, hz, 0.0, -0.18, -0.03, 0.0, -0.68, -0.05, 0.155);
  const neckTendon = sdCapsule(
    ahx,
    hy,
    hz,
    0.115,
    -0.20,
    0.04,
    0.032,
    -0.54,
    0.13,
    0.036
  );
  head = smin(head, smin(neck, neckTendon, 0.04), 0.055);

  // Forehead frown creases
  head += Math.sin(hy * 60.0) * Math.exp(-ahx * 9.0) * clamp(hy - 0.1, 0.0, 0.14) * 0.012;

  // -------------------------------------------------------------------------
  // 2. GLOWING EYES (Set inside the sockets at +Z)
  // -------------------------------------------------------------------------
  const eyeballs = sdSphere(ahx - 0.112, hy - 0.065, hz - 0.228, 0.047);

  // -------------------------------------------------------------------------
  // 3. POINTED GOTHIC DARK SORCERER HOOD & ROBES
  // -------------------------------------------------------------------------
  // Tapered pointed wizard hood peak at top
  const hoodPeak = sdCapsule(hx, hy, hz, 0.0, 0.02, -0.08, 0.0, 0.42, -0.04, 0.46 - clamp(hy, 0.0, 0.5) * 0.36);
  const hoodOuter = smin(
    sdEllipsoid(hx, hy - 0.04, hz + 0.08, 0.50, 0.56, 0.44),
    hoodPeak,
    0.08
  );
  const hoodOpening = sdEllipsoid(hx, hy - 0.01, hz - 0.23, 0.355, 0.44, 0.42);
  let cloak = smax(hoodOuter, -hoodOpening, 0.045);

  const lapel = sdCapsule(ahx, hy, hz, 0.35, 0.12, 0.10, 0.21, -0.55, 0.18, 0.082);
  const shoulders = sdEllipsoid(hx, py + 0.68, pz + 0.04, 0.88, 0.36, 0.42);
  cloak = smin(cloak, smin(lapel, shoulders, 0.08), 0.08);
  cloak += Math.sin(px * 16.0 - py * 10.0) * 0.007;

  // -------------------------------------------------------------------------
  // 4. FOREGROUND 3D GOLD & OBSIDIAN WIZARD CHESS KING (Lower-Left at +Z)
  // -------------------------------------------------------------------------
  const kx = px + 0.43;
  const ky = py + 0.30;
  const kz = pz - 0.36;

  const kingBase1 = sdBox(kx, ky + 0.31, kz, 0.195, 0.032, 0.195) - 0.01;
  const kingBaseRing = sdTorusY(kx, ky + 0.24, kz, 0.15, 0.03);
  const kingPillar = sdCapsule(
    kx,
    ky,
    kz,
    0.0,
    -0.22,
    0.0,
    0.0,
    0.05,
    0.0,
    0.11 - (ky + 0.1) * 0.11
  );
  const kingCollar = sdTorusY(kx, ky - 0.06, kz, 0.112, 0.025);
  const crownFlare = sdCapsule(
    kx,
    ky,
    kz,
    0.0,
    0.07,
    0.0,
    0.0,
    0.19,
    0.0,
    0.08 + clamp(ky - 0.07, 0.0, 0.14) * 0.36
  );
  const crownSpikes =
    Math.cos(Math.atan2(kz, kx) * 6.0) * 0.014 * smoothstep(0.13, 0.21, ky);
  // Prominent 3D Royal Cross standing above the crown
  const crossV = sdBox(kx, ky - 0.34, kz, 0.024, 0.085, 0.024);
  const crossH = sdBox(kx, ky - 0.35, kz, 0.072, 0.023, 0.024);

  let chessKing = smin(kingBase1, kingBaseRing, 0.02);
  chessKing = smin(chessKing, kingPillar, 0.025);
  chessKing = smin(chessKing, kingCollar, 0.02);
  chessKing = smin(chessKing, crownFlare + crownSpikes, 0.018);
  chessKing = smin(chessKing, Math.min(crossV, crossH), 0.008);

  // -------------------------------------------------------------------------
  // 5. ELDER WAND (Held on Right Side, tip at X=+0.34, Y=-0.10 so face is clear)
  // -------------------------------------------------------------------------
  const wand = sdCapsule(
    px,
    py,
    pz,
    0.66,
    -0.58,
    0.34,
    0.34,
    -0.10,
    0.44,
    0.021
  );
  const wandAlong = (px - 0.66) * -0.32 + (py + 0.58) * 0.48;
  const elderWand = wand + Math.sin(wandAlong * 52.0) * 0.0045;

  let d = head;
  let mat = 1;

  if (eyeballs < d) {
    d = eyeballs;
    mat = 3;
  }
  if (cloak < d) {
    d = cloak;
    mat = 2;
  }
  if (chessKing < d) {
    d = chessKing;
    mat = 4;
  }
  if (elderWand < d) {
    d = elderWand;
    mat = 5;
  }

  return [d, mat];
}

function calcNormal(px, py, pz) {
  const e = 0.002;
  const d0 = evaluateScene(px, py, pz)[0];
  const nx = evaluateScene(px + e, py, pz)[0] - d0;
  const ny = evaluateScene(px, py + e, pz)[0] - d0;
  const nz = evaluateScene(px, py, pz + e)[0] - d0;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-7;
  return [nx / len, ny / len, nz / len];
}

function calcAO(px, py, pz, nx, ny, nz) {
  let occ = 0.0;
  let sca = 1.0;
  for (let i = 1; i <= 4; i++) {
    const h = 0.032 * i;
    const d = evaluateScene(px + nx * h, py + ny * h, pz + nz * h)[0];
    occ += (h - d) * sca;
    sca *= 0.65;
  }
  return clamp(1.0 - 2.35 * occ, 0.12, 1.0);
}

function renderMasterWizardIcon(size = 512, isMaskable = false, isRound = false) {
  const buf = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const fovScale = isMaskable ? 1.16 : 0.96;

  // Elder Wand tip on right side (keeps Voldemort face & nose slits 100% clear)
  const spellX = 0.34;
  const spellY = -0.10;
  const spellZ = 0.45;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = (x + 0.5 - half) / half;
      const wy = (half - (y + 0.5)) / half;

      const radDist = Math.sqrt(sx * sx + wy * wy);
      if (isRound && radDist > 0.995) {
        const idx = (y * size + x) * 4;
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      const ux = sx * fovScale;
      const uy = wy * fovScale;

      // Dark Gothic Sanctum background with subtle emerald & gold atmosphere
      const bgRadial = Math.max(0, 1.0 - Math.sqrt(ux * ux + uy * uy) * 0.7);
      let r = 7 + bgRadial * 15;
      let g = 13 + bgRadial * 36;
      let b = 20 + bgRadial * 30;

      // Golden Gothic Sanctum Halo Ring behind the Dark Wizard's head
      const ringDist = Math.abs(Math.sqrt((ux - 0.03) ** 2 + (uy - 0.14) ** 2) - 0.66);
      const halo = Math.exp(-ringDist * 32.0) * 0.65;
      r += halo * 235;
      g += halo * 185;
      b += halo * 65;

      const roX = 0.0,
        roY = 0.0,
        roZ = 2.05;
      let rdX = ux * 0.56;
      let rdY = uy * 0.56;
      let rdZ = -1.0;
      const rdLen = Math.sqrt(rdX * rdX + rdY * rdY + rdZ * rdZ);
      rdX /= rdLen;
      rdY /= rdLen;
      rdZ /= rdLen;

      let t = 1.0;
      let hitMat = 0;
      let glowAccum = 0.0;

      for (let step = 0; step < 56; step++) {
        const px = roX + rdX * t;
        const py = roY + rdY * t;
        const pz = roZ + rdZ * t;

        const dxS = px - spellX;
        const dyS = py - spellY;
        const dzS = pz - spellZ;
        const distSpell = Math.sqrt(dxS * dxS + dyS * dyS + dzS * dzS);
        glowAccum += 0.009 / (0.025 + distSpell * distSpell * 8.5);

        const [d, mat] = evaluateScene(px, py, pz);
        if (d < 0.002) {
          hitMat = mat;
          break;
        }
        t += d * 0.86;
        if (t > 2.95) break;
      }

      if (hitMat > 0) {
        const px = roX + rdX * t;
        const py = roY + rdY * t;
        const pz = roZ + rdZ * t;
        const [nx, ny, nz] = calcNormal(px, py, pz);
        const ao = calcAO(px, py, pz, nx, ny, nz);

        const vx = -rdX,
          vy = -rdY,
          vz = -rdZ;
        const fresnel = Math.pow(
          clamp(1.0 - Math.max(0.0, nx * vx + ny * vy + nz * vz), 0.0, 1.0),
          3.0
        );

        // Light 1: Dramatic Top-Left-Front Moonlight
        const l1x = -0.45,
          l1y = 0.62,
          l1z = 0.64;
        const diff1 = Math.max(0.0, nx * l1x + ny * l1y + nz * l1z);
        const h1x = l1x + vx,
          h1y = l1y + vy,
          h1z = l1z + vz;
        const h1Len = Math.sqrt(h1x * h1x + h1y * h1y + h1z * h1z) + 1e-6;
        const spec1 = Math.pow(
          Math.max(0.0, (nx * h1x + ny * h1y + nz * h1z) / h1Len),
          36.0
        );

        // Light 2: Emerald Spell Point Light at Elder Wand Tip
        let l2x = spellX - px,
          l2y = spellY - py,
          l2z = spellZ - pz;
        const l2Dist = Math.sqrt(l2x * l2x + l2y * l2y + l2z * l2z) + 1e-5;
        l2x /= l2Dist;
        l2y /= l2Dist;
        l2z /= l2Dist;
        const atten2 = 1.2 / (1.0 + l2Dist * l2Dist * 2.8);
        const diff2 = Math.max(0.0, nx * l2x + ny * l2y + nz * l2z) * atten2;
        const h2x = l2x + vx,
          h2y = l2y + vy,
          h2z = l2z + vz;
        const h2Len = Math.sqrt(h2x * h2x + h2y * h2y + h2z * h2z) + 1e-6;
        const spec2 =
          Math.pow(Math.max(0.0, (nx * h2x + ny * h2y + nz * h2z) / h2Len), 30.0) *
          atten2;

        // Light 3: Golden Sanctum Rim Light from Right-Top
        const l3x = 0.78,
          l3y = 0.38,
          l3z = -0.25;
        const diff3 = Math.max(0.0, nx * l3x + ny * l3y + nz * l3z);

        if (hitMat === 1) {
          const vein = Math.pow(
            Math.abs(Math.sin(px * 26.0 + py * 21.0) * Math.cos(pz * 24.0)),
            9.0
          );
          const baseR = 176 - vein * 34;
          const baseG = 184 - vein * 26;
          const baseB = 192 - vein * 16;

          r =
            (baseR * (0.22 + diff1 * 0.76) +
              diff2 * 40 +
              diff3 * 88 +
              spec1 * 125 +
              fresnel * 50) *
            ao;
          g =
            (baseG * (0.22 + diff1 * 0.76) +
              diff2 * 185 +
              diff3 * 70 +
              spec1 * 135 +
              spec2 * 140 +
              fresnel * 100) *
            ao;
          b =
            (baseB * (0.24 + diff1 * 0.78) +
              diff2 * 95 +
              diff3 * 24 +
              spec1 * 150 +
              fresnel * 75) *
            ao;

          // Darken inside nostril slits and mouth crease for crisp Voldemort realism
          const ahx = Math.abs(px - 0.03);
          const hy = py - 0.11;
          const nostrilDist = Math.sqrt((ahx - 0.024) ** 2 + (hy + 0.005) ** 2);
          if (nostrilDist < 0.024 && pz > 0.28) {
            const nShade = clamp(nostrilDist / 0.024, 0.12, 1.0);
            r *= nShade;
            g *= nShade;
            b *= nShade;
          }
        } else if (hitMat === 2) {
          const baseR = 14,
            baseG = 18,
            baseB = 26;
          r =
            (baseR * (0.35 + diff1 * 0.85) +
              diff2 * 28 +
              diff3 * 145 +
              spec1 * 65 +
              fresnel * 165) *
            ao;
          g =
            (baseG * (0.35 + diff1 * 0.85) +
              diff2 * 140 +
              diff3 * 115 +
              spec1 * 72 +
              fresnel * 135) *
            ao;
          b =
            (baseB * (0.38 + diff1 * 0.88) +
              diff2 * 80 +
              diff3 * 38 +
              spec1 * 88 +
              fresnel * 55) *
            ao;
        } else if (hitMat === 3) {
          // 3D Realistic Voldemort Serpentine Eyes: dark outer ring, crimson iris, glowing slit pupil + corneal glint
          const eyeCenterX = px > 0.03 ? 0.142 : -0.082;
          const dxEye = px - eyeCenterX;
          const dyEye = py - 0.175;
          const eyeRad = Math.sqrt(dxEye * dxEye + dyEye * dyEye);
          const isSlit = Math.abs(dxEye) < 0.007 && Math.abs(dyEye) < 0.032;
          const glint = Math.exp(-((dxEye + 0.012) ** 2 + (dyEye - 0.012) ** 2) * 9000.0);
          const irisFade = clamp(1.0 - eyeRad / 0.046, 0.15, 1.0);

          if (isSlit) {
            r = 255;
            g = 245;
            b = 190;
          } else {
            r = 245 * irisFade + glint * 255;
            g = 38 * irisFade + glint * 255;
            b = 18 * irisFade + glint * 255;
          }
        } else if (hitMat === 4) {
          const ky = py + 0.30;
          const isGold =
            ky > 0.04 ||
            Math.abs(ky - 0.06) < 0.032 ||
            Math.abs(ky + 0.24) < 0.036;
          const specGold = Math.pow(
            Math.max(0.0, (nx * h1x + ny * h1y + nz * h1z) / h1Len),
            56.0
          );
          if (isGold) {
            r =
              (228 * (0.32 + diff1 * 0.85 + diff3 * 0.45) +
                specGold * 255 +
                diff2 * 55 +
                fresnel * 150) *
              ao;
            g =
              (182 * (0.32 + diff1 * 0.85 + diff3 * 0.45) +
                specGold * 240 +
                diff2 * 185 +
                fresnel * 120) *
              ao;
            b =
              (52 * (0.28 + diff1 * 0.75) +
                specGold * 175 +
                diff2 * 90 +
                fresnel * 45) *
              ao;
          } else {
            r =
              (24 * (0.35 + diff1 * 0.9) +
                specGold * 220 +
                diff2 * 45 +
                diff3 * 130 +
                fresnel * 140) *
              ao;
            g =
              (28 * (0.35 + diff1 * 0.9) +
                specGold * 205 +
                diff2 * 185 +
                diff3 * 105 +
                fresnel * 115) *
              ao;
            b =
              (40 * (0.35 + diff1 * 0.9) +
                specGold * 155 +
                diff2 * 95 +
                diff3 * 40 +
                fresnel * 55) *
              ao;
          }
        } else if (hitMat === 5) {
          const tipProx = Math.exp(
            -Math.sqrt((px - spellX) ** 2 + (py - spellY) ** 2) * 14.0
          );
          r = (85 * (0.32 + diff1 * 0.8) + spec1 * 95) * ao + tipProx * 150;
          g =
            (60 * (0.32 + diff1 * 0.8) + spec1 * 85 + diff2 * 165) * ao +
            tipProx * 255;
          b =
            (42 * (0.32 + diff1 * 0.8) + spec1 * 75 + diff2 * 95) * ao +
            tipProx * 195;
        }
      }

      // 2D Screen-space Emerald Spell Burst & Lightning Arc (below the chin, from Right Wand Tip to Left Chess King)
      const wandSX = 0.31 / fovScale;
      const wandSY = -0.09 / fovScale;
      const dWand = Math.sqrt((sx - wandSX) ** 2 + (wy - wandSY) ** 2);
      const coreFlash = Math.exp(-dWand * 13.5);
      const outerSpellGlow = clamp(glowAccum * 0.34, 0.0, 1.15);

      const segT = clamp((wandSX - sx) / 0.72, 0.0, 1.0);
      // Arc dips slightly downward across the chest so the face & nose slits remain 100% clear
      const targetY =
        mix(wandSY, -0.02 / fovScale, segT) - Math.sin(segT * Math.PI) * 0.14;
      const jagged =
        Math.sin(sx * 46.0) * 0.015 + Math.cos(sx * 96.0) * 0.007;
      const boltDist = Math.abs(wy - (targetY + jagged));
      const inBoltSpan =
        sx <= wandSX + 0.03 && sx >= -0.43 / fovScale ? 1.0 : 0.0;
      const lightning =
        Math.exp(-boltDist * 68.0) * inBoltSpan * (0.65 + 0.35 * (1.0 - segT));

      r += coreFlash * 165 + outerSpellGlow * 38 + lightning * 185;
      g += coreFlash * 255 + outerSpellGlow * 220 + lightning * 255;
      b += coreFlash * 185 + outerSpellGlow * 135 + lightning * 180;

      // 3D Beveled Gold Icon Frame Border
      if (!isMaskable) {
        const edgeDist = isRound
          ? 1.0 - radDist
          : 1.0 - Math.max(Math.abs(sx), Math.abs(wy));
        if (edgeDist < 0.052 && edgeDist >= 0.0) {
          const bevel = Math.sin((edgeDist / 0.052) * Math.PI);
          const cornerShine = clamp(0.65 - (sx * 0.35 - wy * 0.35), 0.15, 1.0);
          r = mix(r, 148 + bevel * 107 * cornerShine, 0.9);
          g = mix(g, 112 + bevel * 96 * cornerShine, 0.9);
          b = mix(b, 30 + bevel * 56 * cornerShine, 0.9);
        }
      }

      const idx = (y * size + x) * 4;
      buf[idx] = clamp(Math.round(r), 0, 255);
      buf[idx + 1] = clamp(Math.round(g), 0, 255);
      buf[idx + 2] = clamp(Math.round(b), 0, 255);
      buf[idx + 3] = 255;
    }
  }

  return buf;
}

function resizeRGBA(srcBuf, srcSize, targetSize) {
  if (srcSize === targetSize) return srcBuf;
  const dst = Buffer.alloc(targetSize * targetSize * 4);
  const ratio = srcSize / targetSize;

  for (let ty = 0; ty < targetSize; ty++) {
    for (let tx = 0; tx < targetSize; tx++) {
      const x0 = Math.floor(tx * ratio);
      const y0 = Math.floor(ty * ratio);
      const x1 = Math.min(srcSize, Math.ceil((tx + 1) * ratio));
      const y1 = Math.min(srcSize, Math.ceil((ty + 1) * ratio));

      let rSum = 0,
        gSum = 0,
        bSum = 0,
        aSum = 0,
        count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const sIdx = (sy * srcSize + sx) * 4;
          rSum += srcBuf[sIdx];
          gSum += srcBuf[sIdx + 1];
          bSum += srcBuf[sIdx + 2];
          aSum += srcBuf[sIdx + 3];
          count++;
        }
      }

      const dIdx = (ty * targetSize + tx) * 4;
      dst[dIdx] = Math.round(rSum / count);
      dst[dIdx + 1] = Math.round(gSum / count);
      dst[dIdx + 2] = Math.round(bSum / count);
      dst[dIdx + 3] = Math.round(aSum / count);
    }
  }
  return dst;
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

      const glow = Math.max(0, 1 - dist * 0.85);
      let r = Math.round(10 + glow * 32);
      let g = Math.round(13 + glow * 28);
      let b = Math.round(20 + glow * 24);

      if (ny > -0.15 && ny < 0.65) {
        const boardT = (ny + 0.15) / 0.8;
        const halfSpan = 0.28 + boardT * 0.45;
        if (Math.abs(nx) < halfSpan) {
          const bx = (nx + halfSpan) / (2 * halfSpan);
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
          if (bx < 0.02 || bx > 0.98 || boardT < 0.02 || boardT > 0.98) {
            r = 212;
            g = 175;
            b = 55;
          }
        }
      }

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

console.log('Rendering 3D Raymarched Dark Wizard (Voldemort-inspired) + Chess King Icons...');
const master512 = renderMasterWizardIcon(512, false, false);
const masterMaskable512 = renderMasterWizardIcon(512, true, false);
const masterRound192 = renderMasterWizardIcon(192, false, true);

const pubDir = path.resolve('public');
fs.mkdirSync(pubDir, { recursive: true });

fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), encodePNG(512, 512, master512));
fs.writeFileSync(
  path.join(pubDir, 'pwa-maskable-512x512.png'),
  encodePNG(512, 512, masterMaskable512)
);
fs.writeFileSync(
  path.join(pubDir, 'pwa-192x192.png'),
  encodePNG(192, 192, resizeRGBA(master512, 512, 192))
);
fs.writeFileSync(
  path.join(pubDir, 'apple-touch-icon.png'),
  encodePNG(180, 180, resizeRGBA(master512, 512, 180))
);
fs.writeFileSync(path.join(pubDir, 'screenshot-wide.png'), drawScreenshot(1280, 720));
fs.writeFileSync(path.join(pubDir, 'screenshot-narrow.png'), drawScreenshot(720, 1280));

const androidResDir = path.resolve('android/app/src/main/res');
const mipmapSpecs = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

for (const { folder, size } of mipmapSpecs) {
  const dir = path.join(androidResDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const squarePng = encodePNG(size, size, resizeRGBA(master512, 512, size));
  const roundPng = encodePNG(size, size, resizeRGBA(masterRound192, 192, size));
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), squarePng);
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), roundPng);
}

console.log('Generated all 3D Dark Wizard PWA icons and Android mipmap launcher icons!');
