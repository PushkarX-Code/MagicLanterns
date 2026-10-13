import { EQ_BANDS, type Settings } from '@shared/settings'

/** Sources the renderer reads itself, so WebAudio can process them without tainting. */
export const isLocalSource = (url: string | null): boolean => !!url && /^(ml-file|blob|file):/i.test(url)

/** True when any audio setting needs the processing graph (otherwise the element plays untouched). */
export function needsChain(s: Settings): boolean {
  return s.eqEnabled || s.volumeBoost > 100 || s.normalize || s.audioDelay > 0 || s.downmix || s.audioDevice !== 'default'
}

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> }

/**
 * VLC-style audio processing for one <video>: delay → 10-band EQ → normaliser → boost → output.
 * A media element can only be wired into WebAudio once, so the graph lives as long as the element.
 */
export class AudioChain {
  private ctx: SinkContext
  private delay: DelayNode
  private bands: BiquadFilterNode[]
  private comp: DynamicsCompressorNode
  private gain: GainNode
  private device = 'default'

  constructor(el: HTMLMediaElement) {
    this.ctx = new AudioContext() as SinkContext
    const source = this.ctx.createMediaElementSource(el)
    this.delay = this.ctx.createDelay(5)
    this.bands = EQ_BANDS.map((hz, i) => {
      const f = this.ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = hz
      f.Q.value = 1.1
      return f
    })
    this.comp = this.ctx.createDynamicsCompressor()
    this.gain = this.ctx.createGain()
    const nodes: AudioNode[] = [source, this.delay, ...this.bands, this.comp, this.gain, this.ctx.destination]
    nodes.slice(0, -1).forEach((n, i) => n.connect(nodes[i + 1]))
  }

  apply(s: Settings): void {
    const now = this.ctx.currentTime
    this.delay.delayTime.setTargetAtTime(Math.max(0, s.audioDelay) / 1000, now, 0.02)
    this.bands.forEach((b, i) => b.gain.setTargetAtTime(s.eqEnabled ? (s.eqBands[i] ?? 0) : 0, now, 0.02))
    // Normalise: a gentle broadcast-style compressor. Off: a compressor that never engages.
    this.comp.threshold.value = s.normalize ? -24 : 0
    this.comp.ratio.value = s.normalize ? 4 : 1
    this.comp.knee.value = s.normalize ? 12 : 0
    this.gain.gain.setTargetAtTime(Math.max(1, s.volumeBoost / 100) * (s.normalize ? 1.35 : 1), now, 0.02)
    const out = this.ctx.destination
    out.channelCount = s.downmix ? 2 : out.maxChannelCount
    out.channelInterpretation = 'speakers'
    if (s.audioDevice !== this.device && this.ctx.setSinkId) {
      this.device = s.audioDevice
      this.ctx.setSinkId(s.audioDevice === 'default' ? '' : s.audioDevice).catch(() => undefined)
    }
  }

  resume(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined)
  }

  close(): void {
    this.ctx.close().catch(() => undefined)
  }
}
