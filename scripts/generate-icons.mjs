/**
 * Generates the app icons from one procedural source of truth.
 *
 * There is no SVG rasteriser in this toolchain and no image dependency worth
 * adding for four files, so the mark is drawn here with signed distance fields
 * — which antialiases better than supersampling and keeps the script portable.
 *
 * Outputs:
 *   build/icon.png   1024px, macOS-style squircle with margin (also the Linux
 *                    icon and electron-builder's generic fallback)
 *   build/icon.icns  the same squircle, every size macOS asks for
 *   build/icon.ico   full-bleed rounded square, because Windows does not mask
 *
 * Run with `npm run generate:icons` after changing anything below.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'build')

/* --------------------------------------------------------------------------
   Palette — the same warm room and ember accent the app itself uses.
   -------------------------------------------------------------------------- */

const GROUND_TOP = [0x1b, 0x14, 0x12]
const GROUND_BOTTOM = [0x0a, 0x08, 0x08]
const EMBER_LIGHT = [0xff, 0x9a, 0x74]
const EMBER_DEEP = [0xc8, 0x42, 0x1c]
const EMBER_GLOW = [0xff, 0x7a, 0x59]

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** Coverage for a signed distance, antialiased across roughly one pixel. */
const cover = (dist, aa) => clamp01(0.5 - dist / aa)

/** Signed distance to a superellipse — the macOS squircle. */
function squircleDistance(x, y, half, exponent) {
  const nx = Math.abs(x) / half
  const ny = Math.abs(y) / half
  const f = Math.pow(Math.pow(nx, exponent) + Math.pow(ny, exponent), 1 / exponent)
  return (f - 1) * half
}

/** Signed distance to a rounded rectangle. */
function roundedRectDistance(x, y, half, radius) {
  const qx = Math.abs(x) - (half - radius)
  const qy = Math.abs(y) - (half - radius)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius
}

/**
 * Draws the mark: an ember ring lit from the top left, sitting in the app's
 * warm near-black room. The ring echoes the remote's soft pad.
 */
function render(size, shape) {
  const pixels = new Uint8Array(size * size * 4)
  const aa = 1.2
  const centre = size / 2

  // macOS reserves a margin so icons share a common optical size in the Dock.
  // Windows draws the bitmap as-is, so that variant runs edge to edge.
  const half = shape === 'squircle' ? (size * 824) / 1024 / 2 : size / 2
  const cornerRadius = (size * 225) / 1024

  // A ring, not a disc with a hole: the stroke is about a fifth of the outer
  // radius, which is what makes it echo the remote's soft pad rather than a
  // record label.
  const ringOuter = half * 0.6
  const ringInner = half * 0.395
  const glowRadius = half * 0.82

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = px + 0.5 - centre
      const y = py + 0.5 - centre

      const shapeDist =
        shape === 'squircle'
          ? squircleDistance(x, y, half, 5)
          : roundedRectDistance(x, y, half, cornerRadius)
      const shapeAlpha = cover(shapeDist, aa)

      if (shapeAlpha <= 0) {
        continue
      }

      // The room: a warm vertical gradient with the ambient light sitting high,
      // the same way the app's wash does.
      const vertical = clamp01((y + half) / (half * 2))
      let rgb = mixRgb(GROUND_TOP, GROUND_BOTTOM, vertical)

      const ambient = clamp01(1 - Math.hypot(x, y + half * 0.55) / (half * 1.5))
      rgb = mixRgb(rgb, EMBER_GLOW, ambient * ambient * 0.1)

      // The ring's own glow spilling onto the ground.
      const radius = Math.hypot(x, y)
      if (radius > ringOuter && radius < glowRadius) {
        const falloff = 1 - (radius - ringOuter) / (glowRadius - ringOuter)
        rgb = mixRgb(rgb, EMBER_GLOW, falloff * falloff * 0.22)
      }

      // The ring itself, lit from the top left.
      const ringAlpha =
        cover(radius - ringOuter, aa) * (1 - cover(radius - ringInner, aa))
      if (ringAlpha > 0) {
        const lightT = clamp01((x + y) / (half * 2.2) + 0.5)
        rgb = mixRgb(rgb, mixRgb(EMBER_LIGHT, EMBER_DEEP, lightT), ringAlpha)
      }

      // A hairline of light along the top edge, so the shape reads as glass.
      const edge = cover(Math.abs(shapeDist + size * 0.004) - size * 0.0025, aa)
      if (edge > 0 && y < 0) {
        const strength = edge * clamp01(-y / half) * 0.16
        rgb = mixRgb(rgb, [255, 255, 255], strength)
      }

      const offset = (py * size + px) * 4
      pixels[offset] = Math.round(rgb[0])
      pixels[offset + 1] = Math.round(rgb[1])
      pixels[offset + 2] = Math.round(rgb[2])
      pixels[offset + 3] = Math.round(shapeAlpha * 255)
    }
  }

  return pixels
}

/* --------------------------------------------------------------------------
   Encoders. PNG is the only raster format here; ICO and ICNS are both just
   containers that can hold PNG payloads directly.
   -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ -1) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // One filter byte per scanline. Filter 0 (none) keeps this simple; the
  // gradients still compress well because deflate sees smooth runs.
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(entries.length * 16)
  let offset = header.length + directory.length

  entries.forEach((entry, index) => {
    const at = index * 16
    // 256px is written as 0, which is how the format encodes "256".
    directory[at] = entry.size >= 256 ? 0 : entry.size
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size
    directory[at + 2] = 0 // palette
    directory[at + 3] = 0 // reserved
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32BE(0, at + 8)
    directory.writeUInt32LE(entry.png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)])
}

function encodeIcns(entries) {
  const chunks = entries.map((entry) => {
    const head = Buffer.alloc(8)
    head.write(entry.type, 0, 4, 'ascii')
    head.writeUInt32BE(entry.png.length + 8, 4)
    return Buffer.concat([head, entry.png])
  })

  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 4, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

/* --------------------------------------------------------------------------
   Build
   -------------------------------------------------------------------------- */

const squircleCache = new Map()
const pngFor = (size, shape) => {
  const key = `${shape}:${size}`
  if (!squircleCache.has(key)) {
    squircleCache.set(key, encodePng(size, render(size, shape)))
  }
  return squircleCache.get(key)
}

mkdirSync(OUT, { recursive: true })

writeFileSync(join(OUT, 'icon.png'), pngFor(1024, 'squircle'))

// macOS asks for each size at 1x and 2x; the type codes are the sizes it maps
// them to, not the pixel dimensions.
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512]
]
writeFileSync(
  join(OUT, 'icon.icns'),
  encodeIcns(ICNS_TYPES.map(([type, size]) => ({ type, png: pngFor(size, 'squircle') })))
)

writeFileSync(
  join(OUT, 'icon.ico'),
  encodeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngFor(size, 'square') })))
)

console.log('Wrote build/icon.png, build/icon.icns and build/icon.ico')
