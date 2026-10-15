/* Magic Lanterns · the site's motion and sound.
 * The page is one slow film: the Beacon draws itself, the app rises out of the dark, and every chapter is
 * pinned and scrubbed by the scroll, so the visitor sets the pace. Fast scrolling smears the pictures a little,
 * the way a camera pan does. Sound is off until asked for. */
;(() => {
  'use strict'

  // Where "Get it free" goes once the Store listing is live. Until then it scrolls to the last section.
  const STORE_URL = ''

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const root = document.documentElement
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, DrawSVGPlugin, MorphSVGPlugin)

  /* ---------------- Sound ---------------- */
  // A low, warm room tone made on the spot, and four recorded moments: the projector starting, air moving
  // between chapters, a soft boom when the headphones land, a shimmer when the lights come up.
  const sound = (() => {
    let on = false
    let ctx = null
    let master, bed
    const buffers = {}
    const names = ['projector', 'whoosh', 'boom', 'shimmer']
    const log = (name) => window.__REC && (window.__sfxLog = window.__sfxLog || []).push({ name, t: performance.now() })

    function roomTone(c) {
      const out = c.createGain()
      out.gain.value = 0
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 420
      lp.Q.value = 0.4
      ;[
        [55, 'sine', 0.5],
        [82.41, 'sine', 0.22],
        [110.4, 'triangle', 0.08]
      ].forEach(([f, type, g]) => {
        const o = c.createOscillator()
        o.type = type
        o.frequency.value = f
        const v = c.createGain()
        v.gain.value = g
        o.connect(v).connect(lp)
        o.start()
      })
      // The filter breathes, very slowly.
      const lfo = c.createOscillator()
      lfo.frequency.value = 0.06
      const depth = c.createGain()
      depth.gain.value = 140
      lfo.connect(depth).connect(lp.frequency)
      lfo.start()
      // Air in the room.
      const noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate)
      const d = noise.getChannelData(0)
      let last = 0
      for (let i = 0; i < d.length; i++) d[i] = last = last * 0.985 + (Math.random() * 2 - 1) * 0.015
      const src = c.createBufferSource()
      src.buffer = noise
      src.loop = true
      const band = c.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = 700
      const ng = c.createGain()
      ng.gain.value = 0.5
      src.connect(band).connect(ng).connect(lp)
      src.start()
      lp.connect(out)
      return out
    }

    async function boot() {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0
      master.connect(ctx.destination)
      bed = roomTone(ctx)
      bed.connect(master)
      await Promise.all(
        names.map(async (n) => {
          try {
            const res = await fetch(`assets/sfx/${n}.mp3`)
            buffers[n] = await ctx.decodeAudioData(await res.arrayBuffer())
          } catch {
            /* that one stays silent */
          }
        })
      )
    }

    function play(name, gain = 1) {
      log(name)
      if (!on || !ctx || !buffers[name]) return
      const src = ctx.createBufferSource()
      src.buffer = buffers[name]
      const g = ctx.createGain()
      g.gain.value = gain
      src.connect(g).connect(master)
      src.start()
    }

    async function toggle() {
      on = !on
      if (on) {
        if (!ctx) await boot()
        await ctx.resume()
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setTargetAtTime(0.9, t, 0.4)
        bed.gain.setTargetAtTime(0.09, t, 1.6)
        play('projector', 0.8)
      } else if (ctx) {
        const t = ctx.currentTime
        master.gain.cancelScheduledValues(t)
        master.gain.setTargetAtTime(0, t, 0.25)
      }
      return on
    }

    /** Lowers the room tone while the film on the page is speaking. */
    function duck(down) {
      if (!ctx) return
      bed.gain.setTargetAtTime(down ? 0.015 : 0.09, ctx.currentTime, 0.5)
    }

    return { play, toggle, duck, get on() {
      return on
    } }
  })()

  const soundBtn = $('.sound-btn')
  soundBtn.addEventListener('click', async () => {
    const on = await sound.toggle()
    soundBtn.setAttribute('aria-pressed', String(on))
    soundBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on')
  })

  /* ---------------- Links ---------------- */
  $$('[data-store]').forEach((a) => {
    if (STORE_URL) {
      a.href = STORE_URL
      a.target = '_blank'
      a.rel = 'noopener'
    } else a.dataset.go = '#get'
  })

  // The launch list: posted to the host's form handler, answered in place.
  const form = $('.notify')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = $('button', form)
    btn.disabled = true
    try {
      await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)).toString() })
      $('.notify-note').textContent = 'You are on the list. See you on launch day.'
      form.reset()
    } catch {
      $('.notify-note').textContent = 'That did not go through. Try again in a moment.'
    }
    btn.disabled = false
  })

  if (reduce) {
    // Everything simply visible, no smooth scroll, no pinned scenes.
    $$('[data-go]').forEach((a) => a.addEventListener('click', (e) => (e.preventDefault(), $(a.dataset.go)?.scrollIntoView())))
    $('.dock').classList.add('is-shown')
    $$('.speakers i').forEach((i) => i.classList.add('on'))
    return
  }

  /* ---------------- Smooth scroll + motion blur ---------------- */
  const smoother = ScrollSmoother.create({ wrapper: '#smooth-wrapper', content: '#smooth-content', smooth: 1.8, effects: true, smoothTouch: 0.12 })
  window.__smoother = smoother
  smoother.paused(true)

  let blur = 0
  gsap.ticker.add(() => {
    const v = Math.abs(smoother.getVelocity())
    blur += (Math.min(v / 620, 9) - blur) * 0.12
    if (blur < 0.03) blur = 0
    root.style.setProperty('--mb', blur.toFixed(2) + 'px')
    root.style.setProperty('--ms', (1 + blur * 0.008).toFixed(4))
  })

  $$('[data-go]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault()
      const target = a.dataset.go === '#top' ? 0 : $(a.dataset.go)
      smoother.scrollTo(target, true, 'top top')
    })
  )

  /* ---------------- 1. The opening ---------------- */
  const icon = $('.hero .app-icon')
  const heroBits = ['.news', '.hero-title .line', '.hero-sub', '.hero-cta']
  gsap.set(['.nav', '.scroll-cue', ...heroBits], { opacity: 0 })
  gsap.set(icon, { backgroundColor: 'rgba(13,13,15,0)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0)' })
  const r = icon.getBoundingClientRect()
  const toCentre = { x: innerWidth / 2 - (r.left + r.width / 2), y: innerHeight / 2 - (r.top + r.height / 2) }
  gsap.set(icon, { ...toCentre, scale: 2 })
  gsap.set('.b-core', { scaleY: 0, transformOrigin: '50% 100%' })

  // The beam leaves from beneath the Beacon, wherever the icon sits.
  const hero = $('.hero')
  const beam = $('.beam')
  const aim = () => {
    beam.style.setProperty('--ox', icon.offsetLeft + icon.offsetWidth / 2 + 'px')
    beam.style.setProperty('--oy', icon.offsetTop + icon.offsetHeight * 0.86 + 'px')
  }
  aim()
  addEventListener('resize', aim)
  gsap.set(beam, { opacity: 0, '--spread': '3deg' })

  const opening = gsap.timeline({ delay: 0.35, onComplete: () => smoother.paused(false) })
  opening
    .fromTo('.b-arch', { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1.5, ease: 'power3.inOut', stagger: { each: 0.2, from: 'end' } })
    .to('.b-core', { scaleY: 1, duration: 0.9, ease: 'back.out(1.5)' }, 0.75)
    .call(() => sound.play('boom', 0.7), null, 1.3)
    .to(icon, { backgroundColor: 'rgba(13,13,15,1)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.08)', duration: 1.2, ease: 'power1.inOut' }, 1.5)
    .to(icon, { x: 0, y: 0, scale: 1, duration: 1.6, ease: 'expo.inOut' }, 1.8)
    // The lantern throws its light: a thin shaft that opens into a beam.
    .to(beam, { opacity: 1, duration: 1.2, ease: 'power1.out' }, 2.4)
    .to(beam, { '--spread': '34deg', duration: 3, ease: 'expo.out' }, 2.4)
    .fromTo(heroBits, { opacity: 0, y: 40, filter: 'blur(16px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6, ease: 'expo.out', stagger: 0.12 }, 2.75)
    .fromTo('.nav', { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 1.4, ease: 'expo.out' }, 3.1)
    .to('.scroll-cue', { opacity: 1, duration: 1 }, 3.6)

  // Dust turning in the beam: brighter inside the light, nearly gone outside it.
  const motes = $('.motes')
  const mctx = motes.getContext('2d')
  let dust = []
  const sizeMotes = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    motes.width = hero.offsetWidth * dpr
    motes.height = hero.offsetHeight * dpr
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    dust = Array.from({ length: Math.round(hero.offsetWidth / 14) }, () => ({
      x: Math.random() * hero.offsetWidth,
      y: Math.random() * hero.offsetHeight,
      r: 0.5 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.04 - Math.random() * 0.1,
      tw: Math.random() * Math.PI * 2
    }))
  }
  sizeMotes()
  addEventListener('resize', sizeMotes)
  const drawMotes = () => {
    const w = hero.offsetWidth
    const h = hero.offsetHeight
    const ox = parseFloat(beam.style.getPropertyValue('--ox')) || w / 2
    const oy = parseFloat(beam.style.getPropertyValue('--oy')) || h * 0.3
    const spread = (parseFloat(gsap.getProperty(beam, '--spread')) || 34) * (Math.PI / 180)
    const lit = Number(gsap.getProperty(beam, 'opacity'))
    mctx.clearRect(0, 0, w, h)
    for (const d of dust) {
      d.x += d.vx
      d.y += d.vy
      d.tw += 0.02
      if (d.y < -4) (d.y = h + 4), (d.x = Math.random() * w)
      if (d.x < -4) d.x = w + 4
      if (d.x > w + 4) d.x = -4
      const dx = d.x - ox
      const dy = d.y - oy
      const off = Math.abs(Math.atan2(dx, dy)) // 0 = straight down the beam
      const inBeam = dy > 0 ? Math.max(0, 1 - off / spread) : 0
      const fall = Math.max(0, 1 - Math.hypot(dx, dy) / (h * 0.85))
      const a = lit * (0.04 + 0.75 * inBeam * fall) * (0.6 + 0.4 * Math.sin(d.tw))
      if (a < 0.01) continue
      mctx.fillStyle = `rgba(255,226,186,${a.toFixed(3)})`
      mctx.beginPath()
      mctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      mctx.fill()
    }
  }
  ScrollTrigger.create({ trigger: hero, start: 'top bottom', end: 'bottom top', onToggle: (st) => (st.isActive ? gsap.ticker.add(drawMotes) : gsap.ticker.remove(drawMotes)) })

  // Scrolling away, the hero loses focus and the light dims.
  gsap
    .timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.4 } })
    .to(['.news', '.app-icon', '.hero-title', '.hero-sub', '.hero-cta'], { y: -90, opacity: 0, filter: 'blur(14px)', stagger: 0.04, ease: 'none' }, 0)
    .to(beam, { opacity: 0.15, '--spread': '48deg', ease: 'none' }, 0)
    .to('.scroll-cue', { opacity: 0, duration: 0.2 }, 0)

  /* ---------------- 2. The reveal ---------------- */
  const revealWrap = $('.reveal .screen-wrap')
  gsap
    .timeline({
      scrollTrigger: { trigger: '.reveal', start: 'top top', end: '+=130%', pin: true, scrub: 1.4, onEnter: () => sound.play('whoosh', 0.6) }
    })
    .fromTo(revealWrap, { rotateX: 32, scale: 0.78, y: 160, opacity: 0.15 }, { rotateX: 0, scale: 1, y: 0, opacity: 1, ease: 'power2.out', duration: 1 })
    .fromTo('.reveal .screen-light', { opacity: 0, scale: 0.9 }, { opacity: 0.62, scale: 1.16, ease: 'power1.inOut', duration: 1 }, 0.15)
    .to({}, { duration: 0.35 })

  /* ---------------- Focus pulls: headlines sharpen as they arrive ---------------- */
  $$('.focus').forEach((el) =>
    gsap.fromTo(
      el,
      { opacity: 0, y: 56, filter: 'blur(18px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', ease: 'none', scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 55%', scrub: 1.4 } }
    )
  )
  $$('.kicker').forEach((el) =>
    gsap.fromTo(el, { opacity: 0, letterSpacing: '0.4em' }, { opacity: 1, letterSpacing: '0.16em', ease: 'none', scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 65%', scrub: 1.4 } })
  )

  /* ---------------- 3. Library: a reel that runs sideways ---------------- */
  const track = $('.strip-track')
  const travel = () => track.scrollWidth - innerWidth
  const reel = gsap.to(track, {
    x: () => -travel(),
    ease: 'none',
    scrollTrigger: { trigger: '.strip', start: 'top top', end: () => '+=' + travel() * 1.25, pin: true, scrub: 1.6, invalidateOnRefresh: true, onEnter: () => sound.play('whoosh', 0.5) }
  })
  $$('.frame').forEach((f) =>
    gsap
      .timeline({ scrollTrigger: { trigger: f, containerAnimation: reel, start: 'left right', end: 'right left', scrub: true } })
      .fromTo(f, { scale: 0.86, opacity: 0.35 }, { scale: 1, opacity: 1, ease: 'power1.out', duration: 1 })
      .to(f, { scale: 0.86, opacity: 0.35, ease: 'power1.in', duration: 1 })
  )

  /* ---------------- 4. Cinema: the lights go down and the picture fills the room ---------------- */
  const frame = $('.cinema-frame')
  const video = $('.cinema-video')
  const hear = $('.hear')
  const fill = () => Math.max(innerWidth / frame.offsetWidth, innerHeight / frame.offsetHeight) * 1.002
  gsap
    .timeline({
      scrollTrigger: {
        trigger: '.cinema-stage',
        start: 'top top',
        end: '+=240%',
        pin: true,
        scrub: 1.6,
        invalidateOnRefresh: true,
        onEnter: () => (video.preload = 'auto'),
        onToggle: (st) => (st.isActive ? video.play().catch(() => {}) : video.pause())
      }
    })
    .fromTo('.cinema-title', { opacity: 0, scale: 1.12, filter: 'blur(20px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', ease: 'power2.out', duration: 0.5 })
    .to('.cinema-title', { opacity: 0, scale: 0.86, filter: 'blur(14px)', ease: 'power2.in', duration: 0.45 }, 0.75)
    .fromTo(frame, { scale: 0.42, opacity: 0, borderRadius: 30 }, { scale: 1, opacity: 1, ease: 'power2.inOut', duration: 0.9 }, 0.7)
    .call(() => sound.play('whoosh', 0.55), null, 0.9)
    // Full screen: a moment with nothing but the picture, and the page steps out of the way...
    .to(frame, { scale: fill, borderRadius: 0, ease: 'power2.inOut', duration: 0.9 })
    .to('.nav', { opacity: 0, y: -12, duration: 0.4 }, '<0.4')
    .to(root, { '--dock-dim': 0, duration: 0.4 }, '<')
    .to({}, { duration: 0.5 })
    .to('.nav', { opacity: 1, y: 0, duration: 0.4 })
    .to(root, { '--dock-dim': 1, duration: 0.4 }, '<')
    // ...then it settles back into a frame and the words arrive beneath it.
    .to(frame, { scale: 0.74, yPercent: -9, borderRadius: 30, ease: 'power2.inOut', duration: 0.9 })
    .fromTo('.cinema-caption', { opacity: 0, y: 30, filter: 'blur(12px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 }, '-=0.45')
    .to(hear, { opacity: 1, duration: 0.3 }, '<0.2')
    .to({}, { duration: 0.5 })

  hear.addEventListener('click', () => {
    video.muted = !video.muted
    hear.setAttribute('aria-pressed', String(!video.muted))
    $('.hear-label').textContent = video.muted ? 'Hear it' : 'Sound on'
    if (!video.muted) {
      video.currentTime = 0
      video.play().catch(() => {})
    }
    sound.duck(!video.muted)
  })

  /* ---------------- 5. Sound: the Beacon becomes a pair of headphones ---------------- */
  const cup = (cx, top = 580, w = 190, h = 300) => {
    const rr = w / 2
    return `M${cx - rr} ${top + rr} A${rr} ${rr} 0 0 1 ${cx + rr} ${top + rr} L${cx + rr} ${top + h - rr} A${rr} ${rr} 0 0 1 ${cx - rr} ${top + h - rr} Z`
  }
  const wave = (side, rad) => {
    const cx = side < 0 ? 232 : 792
    const cy = 735
    const a = (deg) => `${cx + side * rad * Math.cos((deg * Math.PI) / 180)} ${cy + rad * Math.sin((deg * Math.PI) / 180)}`
    return `M${a(-36)} A${rad} ${rad} 0 0 ${side < 0 ? 0 : 1} ${a(36)}`
  }
  $$('.p-wave').forEach((p, i) => {
    const side = i % 2 ? 1 : -1
    p.setAttribute('d', wave(side, 120 + (i < 2 ? 44 : 88)))
    gsap.set(p, { transformOrigin: side < 0 ? '100% 50%' : '0% 50%' })
  })
  gsap.set('.p-right', { opacity: 0 })
  const speakers = $$('.speakers i')
  let landed = false
  gsap
    .timeline({
      scrollTrigger: {
        trigger: '.sound-stage',
        start: 'center center',
        end: '+=200%',
        pin: true,
        scrub: 1.4,
        onUpdate: (st) => {
          const lit = Math.round(gsap.utils.mapRange(0.55, 0.92, 0, speakers.length, st.progress))
          speakers.forEach((s, i) => s.classList.toggle('on', i < lit))
          if (!landed && st.progress > 0.5 && st.direction > 0) sound.play('boom', 0.8)
          landed = st.progress > 0.5
        }
      }
    })
    .fromTo('.sound-copy > *', { opacity: 0, x: -50, filter: 'blur(14px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', stagger: 0.08, duration: 0.5, ease: 'power2.out' })
    .to('.p-band', { morphSVG: 'M232 690 L232 512 A280 280 0 0 1 792 512 L792 690', duration: 0.8, ease: 'power2.inOut' }, 0.3)
    .to('.p-cushion', { morphSVG: 'M290 600 L290 512 A222 222 0 0 1 734 512 L734 600', attr: { 'stroke-width': 30 }, duration: 0.8, ease: 'power2.inOut' }, 0.35)
    .set('.p-right', { opacity: 1 }, 0.4)
    .to(['.p-left', '.p-right'], { morphSVG: { shape: cup(512), type: 'rotational' }, duration: 0.45, ease: 'power2.inOut' }, 0.4)
    .to('.p-left', { x: -280, duration: 0.55, ease: 'back.out(1.4)' }, 0.85)
    .to('.p-right', { x: 280, duration: 0.55, ease: 'back.out(1.4)' }, 0.88)
    .fromTo('.p-wave', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, stagger: 0.06, duration: 0.4, ease: 'power2.out' }, 1.35)
    .fromTo('.rings i', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, stagger: 0.1, duration: 0.6, ease: 'power2.out' }, 1.35)
    .to({}, { duration: 0.6 })

  /* ---------------- 6. Ambient Light ---------------- */
  gsap
    .timeline({ scrollTrigger: { trigger: '.ambient-wrap', start: 'top 85%', end: 'center 45%', scrub: 1.6 } })
    .fromTo('.ambient-wrap .screen-light', { opacity: 0, scale: 0.9 }, { opacity: 0.9, scale: 1.32, ease: 'power1.inOut' })
    .fromTo('.ambient-wrap .screen', { scale: 0.92 }, { scale: 1, ease: 'power1.out' }, 0)

  /* ---------------- 7. Lights up ---------------- */
  let day = false
  gsap.to('.day-wash', {
    opacity: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: '#day',
      start: 'top 75%',
      end: 'top 15%',
      scrub: 1.2,
      onUpdate: (st) => {
        const now = st.progress > 0.5
        if (now !== day) {
          day = now
          root.classList.toggle('is-day', day)
          if (day) sound.play('shimmer', 0.55)
        }
      }
    }
  })
  gsap.fromTo('.day-shot', { y: 120, scale: 0.94 }, { y: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: '.day-shot', start: 'top bottom', end: 'center center', scrub: 1.6 } })
  gsap.fromTo('.plat', { opacity: 0, y: 50, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '.platforms', start: 'top 90%', end: 'top 60%', scrub: 1.4 } })
  gsap.fromTo('.finale .app-icon', { scale: 0.6, opacity: 0, rotate: -8 }, { scale: 1, opacity: 1, rotate: 0, ease: 'none', scrollTrigger: { trigger: '.finale', start: 'top 85%', end: 'top 45%', scrub: 1.4 } })

  /* ---------------- The dock ---------------- */
  const dock = $('.dock')
  ScrollTrigger.create({
    trigger: '.reveal',
    start: 'top 35%',
    endTrigger: '.finale',
    end: 'top 70%',
    onToggle: (st) => dock.classList.toggle('is-shown', st.isActive)
  })

  addEventListener('load', () => ScrollTrigger.refresh())
})()
