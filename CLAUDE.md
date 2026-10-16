# Magic Lanterns — working notes

Read this first. It is how Pushkar works and where the project stands.

## Who and how

Pushkar is a self-taught video producer (AI ads, UGC, batch videos, podcast-style ads) who learns by doing.

- Be direct and structured. No filler, no explaining what you are about to do.
- Plan before any new project; start only when the plan has enough context. If one piece of critical information is missing, ask one sharp question.
- If an idea is weak, say so and why. Honest feedback over validation.
- "Draft" means a real draft, not a framework.
- Design changes need a demo (screenshots or a frame-by-frame video) and his approval before they ship.

## Standing rules (verbatim where quoted)

- Free tools only. Flag anything paid before using it.
- "Do NOT scrape Google."
- "don't add any exposed API key settings, Hide them and use the API as default." Keys live in the hidden key service (`worker/`), never in the app, the site or chat.
- API keys stay hidden (never in code, the site or chat). The app repo is public by his choice (16 Oct: "we're building stuffs"); downloads and updates come from its GitHub Releases.
- "don't add any words related to VLC or any other media player… never mention any corporation names." Required attributions stay: TMDB, JustWatch via TMDB, FFmpeg (GPL), Sintel (CC BY). The "Dolby Vision" / "Dolby Atmos" badges stay (his decision, 16 Oct).
- README images: full-frame, rounded corners, no background, one per row, never grouped.
- Keep the repo lean; merge files smartly.
- Nothing is promoted or posted publicly without his approval.

## Git workflow

- Develop on the branch the session names. Commit messages end with the attribution lines the session gives.
- Open a draft PR, then squash-merge it when approved (he authorised squash-merging my own PRs). After a merge, reset the branch: `git fetch origin main && git checkout -B <branch> origin/main && git push --force-with-lease`.
- Never put a model name in code, commit messages, PRs or docs (beyond the required attribution lines).

## The app

Premium Windows media player: Electron, React, Zustand, GSAP (with DrawSVG, MorphSVG, ScrollTrigger, ScrollSmoother, all free), electron-vite, `node:sqlite`, bundled FFmpeg. See `docs/PLAN.md` for architecture and the business plan.

- Brand: the Beacon (three nested arches, amber→orange→red). Solid black UI, Inter + Instrument Serif italic accents, no drop shadows, no frosted glass, no gradients in panels.
- Cinema Mode: intro (Beacon morphs into headphones), lobby, Sound Stage (up to 7.1 lossless, 8 live meters), Ambient Light. Sounds are synthesised in `src/renderer/src/lib/cinemaSound.ts`.
- Release: `Actions → Release` builds `MagicLanterns-Setup.exe` and `MagicLanterns-Store.appx` (unsigned) and, with publish ticked, publishes the installer to this repo's Releases. Download: `https://github.com/PushkarX-Code/MagicLanterns/releases/latest/download/MagicLanterns-Setup.exe`.

## The website (`site/`)

Static, one long cinematic page plus Privacy, Terms and Credits pages. Hosted on Netlify, project `magiclanterns`, base directory `site`, auto-deploys from `main` (pushes that don't touch `site/` skip the deploy). Live: https://magiclanterns.netlify.app

- Opens muted (his call). The nav Sound button turns on the room tone, a chord-per-chapter score and four ElevenLabs effects (`site/assets/sfx`).
- Screens are 2x captures with 1x/2x `srcset`. Every `<img>` declares its size; keep it that way or the smooth scroller can cut the page short.
- `STORE_URL` at the top of `site/assets/site.js`: set it when the Store listing is live and every "Get it free" button points there.

## Marketing (see `docs/MARKETING.md`)

Launch plan, story, channels and the asset list. Showcase film: `docs/showcase/showcase-film.mp4` (69 s, 1080p, with score, ends "Made by Pushkar"). Clips are cut from it.

## Environment notes

- Cloud sessions block most hosts unless allowed in the environment's Network access settings; new settings apply to new sessions. Hosts we need: `image.tmdb.org` (full-size art), `api.netlify.com`, `netlify-mcp.netlify.app`, `mcp.figma.com`, `api.elevenlabs.io`, and for posting `api.x.com`, `upload.twitter.com`, `oauth.reddit.com`, `www.reddit.com`.
- Secrets go in the environment settings, never in chat. Posting keys, if set: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `REDDIT_CLIENT_ID`, `REDDIT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`.
- Previously connected: ElevenLabs (the restricted connector does voice and sound effects, no music; the full one is `https://api.elevenlabs.io/v1/mcp`), Higgsfield (the connected one could only browse and import, not generate). Check what each can do at the start of a session before promising output.

## Open items

- Microsoft Store account and listing (Pushkar is creating it); then set `STORE_URL`.
- Metadata keys or the hidden key service must be live before launch, or the library shows bare file names.
- Mac / iPad / Android: planned later; open question is on-device files vs streaming from the PC.
- Pro tier (Cinema Mode as the flagship) after launch; launch free first.
