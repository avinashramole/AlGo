import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(data, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = data[src];
    src += 1;
    const dest = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const raw = data[src + i];
      const left = i >= bpp ? out[dest + i - bpp] : 0;
      const up = y > 0 ? out[dest - stride + i] : 0;
      const upLeft = y > 0 && i >= bpp ? out[dest - stride + i - bpp] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      out[dest + i] = value;
    }
    src += stride;
  }
  return out;
}

function rgbaToRgb(pixels, width, height, bpp) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const src = i * bpp;
    const alpha = bpp === 4 ? pixels[src + 3] / 255 : 1;
    rgb[i * 3] = Math.round(pixels[src] * alpha + 255 * (1 - alpha));
    rgb[i * 3 + 1] = Math.round(pixels[src + 1] * alpha + 255 * (1 - alpha));
    rgb[i * 3 + 2] = Math.round(pixels[src + 2] * alpha + 255 * (1 - alpha));
  }
  return rgb;
}

function downscaleRgb(rgb, width, height, maxEdge = 420) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1) return { width, height, rgb };
  const nextW = Math.max(1, Math.round(width * scale));
  const nextH = Math.max(1, Math.round(height * scale));
  const next = Buffer.alloc(nextW * nextH * 3);
  for (let y = 0; y < nextH; y += 1) {
    const srcY = Math.min(height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < nextW; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x + 0.5) / scale));
      const from = (srcY * width + srcX) * 3;
      const to = (y * nextW + x) * 3;
      next[to] = rgb[from];
      next[to + 1] = rgb[from + 1];
      next[to + 2] = rgb[from + 2];
    }
  }
  return { width: nextW, height: nextH, rgb: next };
}

export function decodePngToRgb(bytes) {
  if (!bytes || bytes.length < 24 || bytes.subarray(0, 8).compare(PNG_SIG) !== 0) {
    throw new Error("Not a PNG logo");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error("PNG logo must be 8-bit RGB or RGBA");
  }
  const bpp = colorType === 6 ? 4 : 3;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const pixels = unfilter(inflated, width, height, bpp);
  return downscaleRgb(rgbaToRgb(pixels, width, height, bpp), width, height);
}

export function loadFullBrandLogo(root = path.join(__dirname, "..")) {
  const file = path.join(root, "public", "t2s-logo.png");
  return decodePngToRgb(fs.readFileSync(file));
}

export const PDF_WATERMARK_COVER = 0.72;
export const PDF_MEMBER_WATERMARK_COVER = 0.4;

export function pdfWatermarkOps(pageW, pageH, image, { cover = PDF_WATERMARK_COVER } = {}) {
  const ratio = Number(cover) > 0 ? Number(cover) : PDF_WATERMARK_COVER;
  const max = Math.min(pageW, pageH) * ratio;
  const scale = Math.min(max / image.width, max / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  return [
    "q",
    "/GS1 gs",
    `${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`,
    "/Im1 Do",
    "Q",
  ];
}

export function pdfImageXObject(image) {
  const stream = zlib.deflateSync(image.rgb);
  return {
    dict: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${stream.length} >>`,
    stream,
  };
}
