import { useSettings } from '../state/settings'

// Cinema Mode's sound: an opening theme for the Beacon turning into headphones, and small sounds as you move
// between films and start one. Everything is synthesised on the spot (no audio files): warm sine tones, soft
// filtered air, and a generated room reverb that gives them space. Heard in Cinema Mode only.

let ctx: AudioContext | null = null
let master: GainNode
let room: ConvolverNode

const enabled = (): boolean => useSettings.getState().settings?.cinemaSounds ?? true

/** A generated hall: two channels of noise that die away, so every sound sits in the same space. */
function hall(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function audio(): AudioContext | null {
  if (!enabled()) return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.55
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.ratio.value = 6
    master.connect(limiter).connect(ctx.destination)
    room = ctx.createConvolver()
    room.buffer = hall(ctx, 2.8, 2.6)
    const wet = ctx.createGain()
    wet.gain.value = 0.42
    room.connect(wet).connect(limiter)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setValueAtTime(0.55, ctx.currentTime)
  return ctx
}

interface ToneOpts {
  type?: OscillatorType
  gain?: number
  attack?: number
  release?: number
  glideTo?: number
  detune?: number
  lowpass?: number
  space?: number // how much goes to the room, 0–1
  pan?: number // -1 left … 1 right
}

/** One voice: rises over `attack`, holds, and dies away over `release`. */
function tone(c: AudioContext, freq: number, at: number, hold: number, o: ToneOpts = {}): void {
  const { type = 'sine', gain = 0.1, attack = 0.01, release = 0.4, glideTo, detune = 0, lowpass, space = 0.5, pan = 0 } = o
  const t = c.currentTime + at
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + attack + hold + release)
  osc.detune.value = detune
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + attack)
  env.gain.setValueAtTime(gain, t + attack + hold)
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
  let last: AudioNode = osc.connect(env)
  if (pan) {
    const p = c.createStereoPanner()
    p.pan.value = pan
    last = last.connect(p)
  }
  if (lowpass) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lowpass
    last = last.connect(f)
  }
  last.connect(master)
  if (space > 0) {
    const send = c.createGain()
    send.gain.value = space
    last.connect(send).connect(room)
  }
  osc.start(t)
  osc.stop(t + attack + hold + release + 0.05)
}

/** Air moving: noise through a band that sweeps from one pitch to another. */
function air(c: AudioContext, at: number, dur: number, from: number, to: number, gain: number, q = 1.2): void {
  const t = c.currentTime + at
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = q
  band.frequency.setValueAtTime(from, t)
  band.frequency.exponentialRampToValueAtTime(to, t + dur)
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.55)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(band).connect(env)
  env.connect(master)
  const send = c.createGain()
  send.gain.value = 0.4
  env.connect(send).connect(room)
  src.start(t)
}

const A = { A1: 55, A2: 110, E3: 164.81, A3: 220, B3: 246.94, Cs4: 277.18, E4: 329.63, A4: 440, B4: 493.88, Cs5: 554.37, E5: 659.25, A5: 880, Cs6: 1108.73, E6: 1318.51 }

/** Sound is decoration: if audio fails for any reason, the picture carries on without it. */
const safe =
  (fn: () => void) =>
  (): void => {
    try {
      fn()
    } catch {
      /* no sound this time */
    }
  }

export const cinemaSound = {
  /** The opening, timed to the Beacon becoming headphones (about 4 s). */
  intro: safe(() => {
    const c = audio()
    if (!c) return
    // A low, warm hum as the light draws itself.
    tone(c, A.A1, 0, 2.7, { gain: 0.16, attack: 1.2, release: 1, lowpass: 400, space: 0.2 })
    tone(c, A.A2, 0.1, 2.5, { gain: 0.07, attack: 1.1, release: 0.9, lowpass: 600, space: 0.3 })
    air(c, 0, 1.1, 1800, 5200, 0.025, 0.8)
    // The core rising: one clear note.
    tone(c, A.A4, 0.55, 0.05, { type: 'triangle', gain: 0.07, attack: 0.006, release: 1.1, space: 0.8 })
    tone(c, A.E5, 0.62, 0.05, { gain: 0.03, attack: 0.006, release: 1, space: 0.9 })
    // Gathering and swelling: air rushing in, the floor dropping an octave.
    air(c, 1.3, 0.75, 320, 2400, 0.065)
    tone(c, A.A2, 1.35, 0.3, { gain: 0.08, attack: 0.2, release: 0.6, glideTo: A.A1, lowpass: 500, space: 0.2 })
    // The split: a soft pop as the drop parts, then the halves rush out to either side.
    tone(c, 620, 1.85, 0.01, { gain: 0.05, attack: 0.004, release: 0.16, glideTo: 940, space: 0.4 })
    air(c, 1.85, 0.5, 900, 2200, 0.03)
    // Each cup lands where you'd hear it: a soft thump on the left, then the right.
    tone(c, 74, 2.35, 0.02, { gain: 0.24, attack: 0.006, release: 0.45, glideTo: 48, space: 0.1, pan: -0.7 })
    tone(c, 74, 2.4, 0.02, { gain: 0.24, attack: 0.006, release: 0.45, glideTo: 48, space: 0.1, pan: 0.7 })
    // The cushions settling in: two soft, felted taps.
    tone(c, 210, 2.6, 0.01, { gain: 0.05, attack: 0.004, release: 0.12, glideTo: 150, lowpass: 900, space: 0.2, pan: -0.5 })
    tone(c, 210, 2.66, 0.01, { gain: 0.05, attack: 0.004, release: 0.12, glideTo: 150, lowpass: 900, space: 0.2, pan: 0.5 })
    // Headphones on: the chord opens, and a ripple rings out of each side with the waves.
    const chord = [A.A3, A.E4, A.A4, A.B4, A.Cs5]
    chord.forEach((f, i) => {
      tone(c, f, 2.42 + i * 0.03, 0.6, { gain: 0.035, attack: 0.09, release: 1.5, detune: -4, space: 0.7 })
      tone(c, f, 2.42 + i * 0.03, 0.6, { type: 'triangle', gain: 0.018, attack: 0.09, release: 1.5, detune: 5, space: 0.7 })
    })
    tone(c, A.E6, 2.5, 0.02, { gain: 0.02, attack: 0.004, release: 0.7, space: 1, pan: -0.5 })
    tone(c, A.Cs6, 2.62, 0.02, { gain: 0.018, attack: 0.004, release: 0.7, space: 1, pan: 0.5 })
  }),

  /** Moving to another film: a light tick, a breath of air and one note from the chord. */
  switchFilm: safe(() => {
    const c = audio()
    if (!c) return
    tone(c, 1900, 0, 0.005, { gain: 0.045, attack: 0.002, release: 0.07, glideTo: 1300, space: 0.2 })
    air(c, 0, 0.32, 600, 1900, 0.03)
    const notes = [A.A5, A.Cs6, A.E6]
    tone(c, notes[Math.floor(Math.random() * notes.length)], 0.02, 0.02, { gain: 0.016, attack: 0.004, release: 0.6, space: 0.9 })
  }),

  /** Start the Show: air falling away, a deep warm boom and the chord underneath. */
  startShow: safe(() => {
    const c = audio()
    if (!c) return
    air(c, 0, 0.8, 2600, 380, 0.08)
    tone(c, 92, 0.25, 0.05, { gain: 0.32, attack: 0.01, release: 1.2, glideTo: 40, space: 0.2 })
    ;[A.A2, A.E3, A.A3].forEach((f) => tone(c, f, 0.3, 0.4, { gain: 0.04, attack: 0.3, release: 1.4, lowpass: 900, space: 0.6 }))
  }),

  /** Leaving Cinema Mode: a short fall. */
  leave: safe(() => {
    const c = audio()
    if (!c) return
    air(c, 0, 0.6, 1800, 300, 0.05)
    tone(c, A.E4, 0, 0.05, { gain: 0.03, attack: 0.01, release: 0.8, glideTo: A.A3, space: 0.7 })
  }),

  /** Fades whatever is playing (the opening, when it's skipped). */
  hush(seconds = 0.35): void {
    if (!ctx) return
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds)
  }
}
