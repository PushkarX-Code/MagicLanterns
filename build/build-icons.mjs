// Renders the Beacon icon SVGs into every PNG size Windows and electron-builder need, plus the .ico.
// Usage: npm run icons
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = resolve(import.meta.dirname, '..')
const src = resolve(root, 'build/icon-src')
const out = resolve(root, 'build/icons')
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

const full = await readFile(resolve(src, 'icon.svg'))
const small = await readFile(resolve(src, 'icon-small.svg'))

await mkdir(out, { recursive: true })
const files = {}
for (const size of SIZES) {
  // At 32px and below three arches blur together, so the simplified two-part mark takes over.
  const [svg, width] = size <= 32 ? [small, 64] : [full, 1024]
  const file = resolve(out, `${size}x${size}.png`)
  // Rasterize at 2x the target, then downsample, so the arch edges stay crisp.
  await sharp(svg, { density: (72 * size * 2) / width })
    .resize(size, size)
    .png()
    .toFile(file)
  files[size] = file
}

const ico = await pngToIco(ICO_SIZES.map((s) => files[s]))
await writeFile(resolve(root, 'build/icon.ico'), ico)
await copyFile(files[1024], resolve(root, 'build/icon.png'))

// Microsoft Store tiles (electron-builder reads build/appx). The mark sits centred on a clear tile,
// at the size Windows shows each one; the wide and large tiles give it room to breathe.
const appx = resolve(root, 'build/appx')
await mkdir(appx, { recursive: true })
const TILES = { StoreLogo: [50, 50, 0.9], Square44x44Logo: [44, 44, 1], SmallTile: [71, 71, 0.72], Square150x150Logo: [150, 150, 0.66], Wide310x150Logo: [310, 150, 0.66], LargeTile: [310, 310, 0.6] }
for (const [name, [w, h, fill]] of Object.entries(TILES)) {
  const side = Math.round(Math.min(w, h) * fill)
  const mark = await sharp(side <= 32 ? small : full, { density: (72 * side * 2) / (side <= 32 ? 64 : 1024) }).resize(side, side).png().toBuffer()
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(resolve(appx, `${name}.png`))
}
console.log('Icons written to build/ and build/appx/')
