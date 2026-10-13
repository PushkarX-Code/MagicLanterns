// Renders the lantern icon SVGs into every PNG size Windows and electron-builder need, plus the .ico.
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
  // Below 48px the detailed glass reads as mush, so the simplified mark takes over.
  const [svg, width] = size <= 32 ? [small, 64] : [full, 1024]
  const file = resolve(out, `${size}x${size}.png`)
  // Rasterize at 2x the target, then downsample, so thin glass edges stay crisp.
  await sharp(svg, { density: (72 * size * 2) / width })
    .resize(size, size)
    .png()
    .toFile(file)
  files[size] = file
}

const ico = await pngToIco(ICO_SIZES.map((s) => files[s]))
await writeFile(resolve(root, 'build/icon.ico'), ico)
await copyFile(files[1024], resolve(root, 'build/icon.png'))
await mkdir(resolve(root, 'resources'), { recursive: true })
await copyFile(files[512], resolve(root, 'resources/icon.png'))
console.log('Icons written to build/ and resources/')
