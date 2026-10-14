import { nativeImage } from 'electron'
import { glowColor, type Processor } from './images.ts'

/** Image work with the runtime's own decoder: no extra library to ship. */
export const processImage: Processor = (input, { maxWidth, png, color }) => {
  const image = nativeImage.createFromBuffer(input)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  const sized = width > maxWidth ? image.resize({ width: maxWidth, quality: 'best' }) : image
  const out = sized.getSize()
  return {
    data: png ? sized.toPNG() : sized.toJPEG(88),
    ext: png ? 'png' : 'jpg',
    width: out.width,
    height: out.height,
    // A thumbnail is plenty to average; the bitmap comes back in the platform's BGRA order.
    color: color ? glowColor(image.resize({ width: 32, height: 18, quality: 'good' }).toBitmap(), 'bgra') : null
  }
}

export async function download(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}
