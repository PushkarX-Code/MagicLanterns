import { EQ_BANDS, type Settings } from '@shared/settings'

/** Sources the renderer reads itself, so WebAudio can process them without tainting. */
export const isLocalSource = (url: string | null): boolean => !!url && /^(ml-file|blob|file):|^http:\/\/127\.0\.0\.1:/i.test(url)

/** True when any audio setting needs the processing graph (otherwise the element plays untouched). */
export function needsChain(s: Settings): boolean {
  return (
    s.eqEnabled ||
    s.volumeBoost > 100 ||
    s.normalize ||
    s.audioDelay > 0 ||
    s.downmix ||
    s.audioDevice !== 'default' ||
    s.spatialHeadphones ||
    s.dialogueLift ||
    s.nightListening
  )
}

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> }

const CHANNELS = 8
/**
 * Where each channel of the soundtrack sits around the listener, in degrees (0 = ahead, positive = right),
 * for the channel orders FFmpeg and the browser use: 2.0, 5.1 (L R C LFE SL SR) and 7.1 (L R C LFE BL BR SL SR).
 */
function layout(channels: number): (number | null)[] {
  if (channels >= 8) return [-30, 30, 0, null, -150, 150, -95, 95]
  if (channels >= 6) return [-30, 30, 0, null, -110, 110, null, null]
  return [-30, 30, null, null, null, null, null, null]
}

/**
 * Audio processing for one <video>:
 * delay → dialogue lift → 10-band EQ → normaliser / night → boost → speakers, or the virtual room for headphones.
 * A media element can only be wired into WebAudio once, so the graph lives as long as the element.
 */
export class AudioChain {
  private ctx: SinkContext
  private delay: DelayNode
  private voice: BiquadFilterNode[]
  private bands: BiquadFilterNode[]
  private comps: DynamicsCompressorNode[]
  private gain: GainNode
  private dry: GainNode
  private wet: GainNode
  private room: { split: ChannelSplitterNode; panners: PannerNode[]; lfe: GainNode }
  private meters: AnalyserNode[]
  private meterData = new Float32Array(256)
  private device = 'default'
  private channels = 2

  constructor(el: HTMLMediaElement) {
    this.ctx = new AudioContext() as SinkContext
    const ctx = this.ctx
    const source = ctx.createMediaElementSource(el)
    this.delay = ctx.createDelay(5)
    // Dialogue lift: presence up where voices live, a little mud taken out below them. Works on any layout.
    this.voice = [
      Object.assign(ctx.createBiquadFilter(), { type: 'peaking' }),
      Object.assign(ctx.createBiquadFilter(), { type: 'lowshelf' })
    ]
    this.voice[0].frequency.value = 2400
    this.voice[0].Q.value = 0.8
    this.voice[1].frequency.value = 220
    this.bands = EQ_BANDS.map((hz, i) => {
      const f = ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = hz
      f.Q.value = 1.1
      return f
    })
    // A compressor only takes two channels, so surround is compressed in linked pairs
    // (L R, C LFE, then each pair of surrounds) and put back together; nothing is folded down.
    const apart = Object.assign(ctx.createChannelSplitter(CHANNELS), { channelCountMode: 'explicit', channelInterpretation: 'discrete' })
    const together = ctx.createChannelMerger(CHANNELS)
    this.comps = Array.from({ length: CHANNELS / 2 }, (_, k) => {
      const pair = ctx.createChannelMerger(2)
      apart.connect(pair, 2 * k, 0)
      apart.connect(pair, 2 * k + 1, 1)
      const comp = ctx.createDynamicsCompressor()
      const out = ctx.createChannelSplitter(2)
      pair.connect(comp).connect(out)
      out.connect(together, 0, 2 * k)
      out.connect(together, 1, 2 * k + 1)
      return comp
    })
    this.gain = ctx.createGain()
    const nodes: AudioNode[] = [source, this.delay, ...this.voice, ...this.bands, apart]
    nodes.slice(0, -1).forEach((n, i) => n.connect(nodes[i + 1]))
    together.connect(this.gain)

    // Speakers (dry) and the virtual room (wet) both stay wired; switching crossfades between them.
    this.dry = ctx.createGain()
    this.wet = ctx.createGain()
    this.wet.gain.value = 0
    this.gain.connect(this.dry).connect(ctx.destination)
    const split = ctx.createChannelSplitter(CHANNELS)
    split.channelCountMode = 'explicit'
    split.channelInterpretation = 'discrete'
    this.gain.connect(split)
    const panners = Array.from({ length: CHANNELS }, (_, i) => {
      const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0 })
      split.connect(p, i)
      p.connect(this.wet)
      return p
    })
    // The subwoofer channel has no direction: it goes to both ears, a little lower.
    const lfe = ctx.createGain()
    lfe.gain.value = 0.5
    split.connect(lfe, 3)
    lfe.connect(this.wet)
    this.wet.connect(ctx.destination)
    this.room = { split, panners, lfe }
    this.channels = 0 // set by the first apply()

    // Channel meters for the Sound Stage, read only while it is open.
    const tap = ctx.createChannelSplitter(CHANNELS)
    tap.channelCountMode = 'explicit'
    tap.channelInterpretation = 'discrete'
    this.gain.connect(tap)
    this.meters = Array.from({ length: CHANNELS }, (_, i) => {
      const a = ctx.createAnalyser()
      a.fftSize = 256
      tap.connect(a, i)
      return a
    })
  }

  /** Puts each channel at its seat in the virtual room. */
  private place(channels: number): void {
    this.channels = channels
    const seats = layout(channels)
    this.room.panners.forEach((p, i) => {
      const deg = seats[i]
      p.disconnect()
      if (deg == null) return
      const r = (deg * Math.PI) / 180
      p.positionX.value = Math.sin(r)
      p.positionY.value = 0
      p.positionZ.value = -Math.cos(r)
      p.connect(this.wet)
    })
  }

  /** `channels`: how many the current soundtrack carries, so the virtual room seats them right. */
  apply(s: Settings, channels = 2): void {
    const now = this.ctx.currentTime
    if (channels !== this.channels) {
      this.place(channels)
      // The pairs carry eight channels; keep only the soundtrack's own, so 5.1 stays 5.1 at the speakers.
      Object.assign(this.gain, { channelCount: Math.max(1, Math.min(CHANNELS, channels)), channelCountMode: 'explicit', channelInterpretation: 'discrete' })
    }
    this.delay.delayTime.setTargetAtTime(Math.max(0, s.audioDelay) / 1000, now, 0.02)
    this.voice[0].gain.setTargetAtTime(s.dialogueLift ? 5 : 0, now, 0.08)
    this.voice[1].gain.setTargetAtTime(s.dialogueLift ? -3 : 0, now, 0.08)
    this.bands.forEach((b, i) => b.gain.setTargetAtTime(s.eqEnabled ? (s.eqBands[i] ?? 0) : 0, now, 0.02))
    // Night listening squeezes hardest: loud scenes come down and quiet ones come up. Normalise is the gentle version.
    const [threshold, ratio, knee, makeup] = s.nightListening ? [-38, 8, 18, 1.8] : s.normalize ? [-24, 4, 12, 1.35] : [0, 1, 0, 1]
    for (const c of this.comps) {
      c.threshold.value = threshold
      c.ratio.value = ratio
      c.knee.value = knee
    }
    this.gain.gain.setTargetAtTime(Math.max(1, s.volumeBoost / 100) * makeup, now, 0.02)
    // Headphones get the virtual room (two ears); speakers get every channel the device has, or two for stereo.
    const spatial = s.spatialHeadphones && !s.downmix
    this.dry.gain.setTargetAtTime(spatial ? 0 : 1, now, 0.15)
    this.wet.gain.setTargetAtTime(spatial ? 1 : 0, now, 0.15)
    const out = this.ctx.destination
    out.channelCount = s.downmix || spatial ? 2 : out.maxChannelCount
    out.channelInterpretation = 'speakers'
    if (s.audioDevice !== this.device && this.ctx.setSinkId) {
      this.device = s.audioDevice
      this.ctx.setSinkId(s.audioDevice === 'default' ? '' : s.audioDevice).catch(() => undefined)
    }
  }

  /** Loudness of each channel right now, 0–1 (L R C LFE, then the surrounds). */
  levels(): number[] {
    return this.meters.map((a) => {
      a.getFloatTimeDomainData(this.meterData)
      let sum = 0
      for (const v of this.meterData) sum += v * v
      return Math.min(1, Math.sqrt(sum / this.meterData.length) * 4)
    })
  }

  /** How many speakers the output device offers. */
  get outputs(): number {
    return this.ctx.destination.maxChannelCount
  }

  resume(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined)
  }

  close(): void {
    this.ctx.close().catch(() => undefined)
  }
}
