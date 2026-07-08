// Generates YAIROS PWA icons (arc-reactor style orb) as PNGs with zero dependencies.
// Pure-JS PNG encoder: RGBA buffer -> zlib(deflate) -> PNG chunks.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });

// ---------- PNG encoding ----------
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ---------- Icon art ----------
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.hypot(dx, dy); // 0 center .. 1 edge

      // deep space background with subtle radial lift
      let r = 4 + 10 * (1 - d);
      let g = 8 + 16 * (1 - d);
      let b = 18 + 30 * (1 - d);

      // core orb glow
      const core = Math.exp(-Math.pow(d / 0.34, 2) * 3);
      r += 40 * core;
      g += 190 * core;
      b += 235 * core;
      // white-hot center
      const hot = Math.exp(-Math.pow(d / 0.12, 2) * 3);
      r += 200 * hot;
      g += 60 * hot;
      b += 20 * hot;

      // reactor ring
      const ring = Math.exp(-Math.pow((d - 0.62) / 0.035, 2));
      r += 30 * ring;
      g += 200 * ring;
      b += 255 * ring;
      // faint outer ring
      const ring2 = Math.exp(-Math.pow((d - 0.8) / 0.02, 2));
      r += 10 * ring2;
      g += 70 * ring2;
      b += 110 * ring2;

      // six orbital nodes on the ring (the agent stars)
      const ang = Math.atan2(dy, dx);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const nx = 0.62 * Math.cos(a);
        const ny = 0.62 * Math.sin(a);
        const nd = Math.hypot(dx - nx, dy - ny);
        const node = Math.exp(-Math.pow(nd / 0.045, 2));
        r += 120 * node;
        g += 230 * node;
        b += 255 * node;
      }
      void ang;

      const i = (y * size + x) * 4;
      buf[i] = clamp(r);
      buf[i + 1] = clamp(g);
      buf[i + 2] = clamp(b);
      buf[i + 3] = 255;
    }
  }
  return buf;
}

for (const [name, size] of [
  ["pwa-192.png", 192],
  ["pwa-512.png", 512],
  ["apple-touch-icon.png", 180]
]) {
  writeFileSync(join(pub, name), encodePng(size, drawIcon(size)));
  console.log("wrote public/" + name);
}
