# Magic Lanterns — Build Plan

Premium local media player for Windows. Electron + React 18 + Vite (electron-vite), TypeScript throughout.

---

## 1. Folder structure

```
MagicLanterns/
├─ electron.vite.config.ts
├─ package.json                  scripts, dependencies, and the installer settings ("build")
├─ tsconfig.json                 points at src/tsconfig.node.json and src/tsconfig.web.json
├─ build/                        icon.ico, icon.png (1024), build-icons.mjs (SVG → PNG → .ico)
├─ docs/                         PLAN.md, LOGO_PROMPT.md, README images
└─ src/
   ├─ shared/                    imported by main, engine, preload, renderer
   │  ├─ types.ts                Item, Show, Season, Episode, FileInfo, Track, Progress…
   │  ├─ api.ts                  LanternApi interface (the single UI ↔ backend contract)
   │  └─ ipc.ts                  channel names + payload types
   ├─ main/                      thin: windows, IPC routing, streaming, protocols
   │  ├─ index.ts                app lifecycle, splash → main window
   │  ├─ ipc/                    library.ts, metadata.ts, player.ts, settings.ts
   │  ├─ protocols.ts            ml-img:// serves cached images from disk
   │  ├─ engine-host.ts          spawns + talks to the engine utilityProcess
   │  ├─ stream/
   │  │  ├─ server.ts            127.0.0.1 loopback HTTP, random port, per-session token
   │  │  ├─ planner.ts           native / remux / audio-transcode / full-transcode decision
   │  │  ├─ session.ts           ffmpeg pipeline lifecycle, restart-at-seek
   │  │  ├─ subtitles.ts         embedded → WebVTT, sidecar .srt → WebVTT
   │  │  └─ trickplay.ts         scrubber thumbnail sprite sheets
   │  └─ services/
   │     ├─ db/                  connection, migrations/, repos/ (read side)
   │     ├─ settings.ts          keys encrypted with Electron safeStorage (DPAPI)
   │     └─ ffmpeg.ts            bundled binary paths, probe(), frameGrab(), previewClip()
   ├─ engine/                    Electron utilityProcess — all heavy work, off main + UI
   │  ├─ index.ts                job router, progress events
   │  ├─ jobs.ts                 priority queue (user-visible items first)
   │  ├─ scanner/                walk.ts, watcher.ts (chokidar), parse.ts, group.ts
   │  ├─ probe/                  ffprobe → normalized FileInfo (HDR/DV/Atmos detection)
   │  ├─ metadata/               tmdb.ts, omdb.ts, matcher.ts, queue.ts (rate limits)
   │  └─ images/                 download, resize, dominant color, thumbhash placeholder
   ├─ preload/index.ts           contextBridge → window.lantern (typed, no Node in UI)
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ design/              tokens.css, glass.css, type.css, motion.ts (GSAP eases)
         ├─ focus/               spatial nav engine, useFocusable, tilt/parallax
         ├─ components/          Glass, PillButton, GlassIconButton, Card, PosterTile,
         │                       Row, Hero, Skeleton, BlurImage, Badge, RatingsRow,
         │                       ProgressLine, AmbientLayer, Sidebar, Clock, Lantern
         ├─ screens/             Splash, Home, Movies, Shows, Continue, Collections,
         │                       Folders, Search, Detail, Player, Settings, Onboarding
         ├─ player/              Controls, Scrubber, TrickplayPreview, TrackMenus,
         │                       NextEpisodeCard, SkipIntro, PauseCard, ResumePrompt
         ├─ state/               zustand stores, api.ts (picks mock or IPC impl)
         └─ mock/                fixture.json + MockApi implementing LanternApi
```

**Key decision:** the UI only ever talks to `LanternApi`. Phase 1 ships `MockApi`; Phases 2–4 swap in `IpcApi`. No screen gets rewritten when real data arrives.

---

## 2. Packages

| Purpose | Package | License |
|---|---|---|
| Shell | electron, electron-vite, electron-builder | MIT |
| UI | react 18, react-dom, react-router-dom (MemoryRouter) | MIT |
| State | zustand | MIT |
| Motion | gsap (+ Flip for card → detail shared element) | GSAP Standard "no charge" license ⚠ |
| Focus engine | @noriginmedia/norigin-spatial-navigation | MIT |
| Icons / font | lucide-react, @fontsource-variable/inter (bundled, offline) | ISC / OFL |
| Database | built-in `node:sqlite` (WAL mode), no native module to rebuild | Node / public domain |
| Watcher | chokidar | MIT |
| Media | ffmpeg-static, ffprobe-static | GPL builds ⚠ |
| Parsing | @ctrl/video-filename-parser | MIT |
| Matching | fastest-levenshtein (title similarity scoring) | MIT |
| Rate limits | p-queue | MIT |
| Images | sharp (resize, dominant color), thumbhash (blur-up placeholders) | Apache / MIT |
| Search | fuse.js (typo-tolerant fuzzy search) | Apache |
| Icon build | sharp + png-to-ico (dev only) | MIT |

### Flags (cost / licensing)
- **TMDB:** free for non-commercial use, attribution required (goes in About). Commercial use is paid.
- **OMDb:** free key = 1,000 requests/day. Paid tiers above that. We cache permanently, refresh ratings every 30 days.
- **GSAP:** free including all plugins, but its own license, not OSI open source. Fine for this app.
- **ffmpeg-static:** GPL binaries. Free for personal use; public distribution needs a license notice + source link (added to About + installer).
- **Code signing:** Windows certificates are paid. Installer ships unsigned → SmartScreen "unknown publisher" warning on first install.
- **Native modules:** the database is built into the runtime, so nothing to compile. sharp ships prebuilt binaries; if a prebuild misses, Windows needs VS Build Tools (free).
- **Playback limits:** Dolby Vision profile 5 has no correct native path in Chromium — it plays tone-mapped via FFmpeg, not true DV.

---

## 3. SQLite schema

`PRAGMA journal_mode=WAL; foreign_keys=ON;` Migrations tracked with `PRAGMA user_version`.

```sql
-- Library sources
folders        (id PK, path UNIQUE, enabled, added_at, last_scan_at)

-- Physical files + ffprobe results
files          (id PK, folder_id FK, path UNIQUE, size, mtime, missing,
                duration, container, video_codec, width, height, fps, bitrate,
                hdr TEXT,            -- SDR | HDR10 | HDR10+ | HLG | DV
                dv_profile, embedded_title,
                parsed_title, parsed_year, parsed_season, parsed_episode,
                kind TEXT,           -- movie | episode | unknown
                item_id FK NULL,     -- movie it belongs to
                probed_at, added_at)
streams        (id PK, file_id FK, idx, type,   -- video | audio | subtitle
                codec, language, title, channels, layout, is_atmos,
                is_default, is_forced, is_text)  -- is_text: extractable to VTT
external_subs  (id PK, file_id FK, path, language, format, forced)

-- Metadata entities
items          (id PK, kind,                     -- movie | show
                tmdb_id, imdb_id, title, original_title, sort_title, year,
                tagline, overview, runtime, certification, status,
                rating_tmdb, rating_imdb, rating_rt, rating_mc, trailer_key,
                poster_img FK, backdrop_img FK, logo_img FK, fallback_img FK,
                match_state,                     -- pending | matched | low_confidence | unmatched | manual
                match_score, favorite, added_at, updated_at,
                meta_fetched_at, ratings_fetched_at)
seasons        (id PK, show_id FK, number, name, overview, poster_img FK, air_date)
episodes       (id PK, show_id FK, season_id FK, season_number, number,
                title, overview, still_img FK, runtime, air_date, rating)
file_episodes  (file_id FK, episode_id FK, PK(file_id, episode_id))  -- multi-episode files
genres         (id PK, tmdb_id, name)
item_genres    (item_id FK, genre_id FK)
people         (id PK, tmdb_id UNIQUE, name, profile_img FK)
credits        (item_id FK, person_id FK, kind, character, job, ord)

-- Image cache index (files live in %APPDATA%/Magic Lanterns/cache/images)
images         (id PK, source_url UNIQUE, local_path, width, height,
                dominant_color, thumbhash, bytes, fetched_at)

-- Generated media (frame grabs, 10s hero loops, trickplay sprites, extracted subs)
generated      (id PK, file_id FK, type, local_path, meta_json, created_at)

-- Watch state
playback       (file_id PK FK, position, duration, watched, play_count,
                last_played_at, audio_stream, subtitle_stream)
intro_markers  (show_id FK, season_number NULL, start, end)   -- manual Skip Intro

-- Collections ("My List" is a system collection)
collections       (id PK, name, is_system, cover_img FK, created_at)
collection_items  (collection_id FK, item_id FK, ord)

-- Settings (keys stored encrypted via safeStorage)
settings       (key PK, value_json)
```

Derived, not stored: Continue Watching, Next Episode per show, Unwatched, genre rows → SQL views.

---

## 4. Process + IPC architecture

```
┌──────────────── Renderer (React, sandboxed) ────────────────┐
│  screens → LanternApi → window.lantern (preload bridge)     │
└──────────────┬─────────────────────────────▲────────────────┘
       invoke (request/response)     events (push)
┌──────────────▼─────────────────────────────┴────────────────┐
│  Main process (thin)                                         │
│  • IPC handlers  • read-only DB connection (fast queries)    │
│  • ml-img:// protocol  • loopback stream server + ffmpeg     │
└──────────────┬─────────────────────────────▲────────────────┘
        parentPort jobs              progress / changed events
┌──────────────▼─────────────────────────────┴────────────────┐
│  Engine (utilityProcess) — owns all DB writes                │
│  scanner · watcher · ffprobe · parser · matcher · TMDB/OMDb  │
│  image cache · frame grabs · hero loops · trickplay          │
└──────────────────────────────────────────────────────────────┘
```

- **Security:** contextIsolation on, nodeIntegration off, sandbox on. Renderer reaches nothing except `window.lantern`.
- **Requests** (`ipcRenderer.invoke`): `library:home`, `library:item`, `library:show`, `library:search-index`, `library:addFolder`, `meta:fixMatch.search`, `meta:fixMatch.apply`, `player:open`, `player:seek`, `player:progress`, `settings:get/set`…
- **Events** (`webContents.send`): `scan:progress {found, identified, current}`, `items:changed [ids]`, `item:artwork-ready {id, image}`, `job:error`. Renderer refetches changed ids and crossfades the new content in.
- **Why DB split:** WAL lets the engine write while main reads. UI queries never wait on a scan.
- **Playback:** renderer reports codec support at startup (`canPlayType`/`MediaSource.isTypeSupported`). `player:open` → planner picks:
  1. **native** — direct file over the loopback server with HTTP Range
  2. **remux** — `-c:v copy` to fragmented MP4
  3. **audio transcode** — video copy, DTS/AC3/TrueHD → AAC (keeps 5.1)
  4. **full transcode** — last resort (H.264, hardware encoder when available)
  
  Seek in modes 2–4 = kill ffmpeg, restart with `-ss`, UI keeps its own timeline offset so the scrubber stays true to the full runtime.
- **Offline:** every image is served from `ml-img://` cache. Network is only ever a background refresh.

---

## 5. Phases

**Phase 1 — Shell (visually complete, mock data)**
App icon (SVG + .ico/PNGs), LOGO_PROMPT.md, splash animation, design tokens, glass system, ambient color layer, sidebar (expand/collapse rail, live clock), Home (hero carousel + Ken Burns + idle video loop, all rows), Detail page (full cinematic layout, below-the-fold cast/seasons/file info/more like this), Player screen (full ten-foot controls UI against a real sample video), focus engine + tilt + Flip shared-element transition, skeletons + blur-up everywhere, Reduce Motion.

**Phase 2 — Library engine**
Folder add/remove, recursive scan, chokidar watcher, ffprobe normalization, filename + folder parsing, series grouping, SQLite + migrations, unmatched generated cards (frame grab at 30% + cleaned name), scan progress events.

**Phase 3 — Metadata**
TMDB match + scoring, details/credits/images/logos/certification/seasons/episodes, OMDb ratings, rate-limited queue, image cache + dominant color + thumbhash, skeleton → content swap, Fix Match.

**Phase 4 — Player**
Stream planner, loopback server, remux/transcode with seek restart, subtitles (embedded + sidecar), audio track switching, trickplay sprites, progress tracking, resume prompt, Skip Intro marking, Next Episode countdown.

**Phase 5 — Polish**
Fuzzy search, collections + My List, Continue Watching + Next Up logic, onboarding with live first-scan, Settings complete, About, NSIS installer.

Stop after every phase with: what was built + exact run steps.

---

## 6. Dev + run notes
- Dev on Windows: `npm install` → `npm run dev`.
- Installer: `npm run dist` on Windows (NSIS on Linux needs Wine, not worth it).
- Data lives in `%APPDATA%/Magic Lanterns/` (db, image cache, generated media).

---

## Next up (planned 14 Oct)

Mac version waits until everything else is done and fixed.

### A. Remote updates for users

Goal: installed copies find new versions and update in one click, while the code repo stays private.

How: a second, **public** repo `PushkarX-Code/MagicLanterns-Releases` that holds only installers (no code, no keys). The app's update check and the download links read from it.

**You do (5 min, once):**
1. Create an empty public repo named `MagicLanterns-Releases`.
2. Create a fine-grained token with *Contents: Read and write* on that one repo only.
3. Add it to this private repo as the Actions secret `RELEASES_TOKEN`.

**I do:**
1. `electron-builder.yml`: point `publish` at `MagicLanterns-Releases`.
2. `release.yml`: on a version tag, build, then publish the installer, `latest.yml` and blockmap to the releases repo using `RELEASES_TOKEN`. Smaller "only what changed" downloads come free from the blockmap.
3. README and `install.ps1`: download links point at the releases repo; the releases repo gets a one-paragraph README.
4. Test the whole loop: install v1.0.0, publish v1.0.1, confirm the app offers it, downloads, restarts on the new version.

Cost: free. Flag: without paid code signing, Windows SmartScreen still warns on the first install (updates afterwards don't).

### B. Cast pages

Goal: click any cast member and see who they are and everything they're in.

1. **Data:** the snapshot sends each cast member's TMDB id. A new IPC `meta:person(id)` fetches `/person/{id}` with combined credits, cached in the database for 7 days (migration 4: `person_cache`). The metadata proxy allowlist adds `/person/{id}`.
2. **Screen:** large portrait, name, known for, short bio (expandable). Then two rows:
   - **In your library:** titles you own that they're in, playable straight away.
   - **Filmography:** everything else, newest and most popular first; opens the existing title preview with where to watch.
3. **Feel:** cast cards become focusable and clickable; the portrait morphs into the page header with the same shared-element transition the title cards use; Escape returns to the title.
4. **Demo/browser mode:** shows the "In your library" row from the demo data.
5. **Tests:** credit mapping, library matching, cache expiry.

Order: A first (unblocks downloads and updates), then B.

**Done 15 Oct:** A (remote updates) and B (cast pages), then Step 15: subtitles (embedded + sidecar, encoding, delay), scrub stills while streaming, Skip Intro by audio fingerprints (chapters win), Up Next with real episode order, and copied streams that start on a keyframe so the clock and subtitles match the picture. Picture-based subtitles (Blu-ray/DVD) are listed but not drawn yet.

---

# Business plan (v2, 15 Oct)

Magic Lanterns ships on the **Microsoft Store** as **free to download, with Pro as an upgrade**. Everything a player must do stays free. Pro adds experiences no other Windows player has. Order of work: **finish v1 → Store launch → Pro infrastructure → Pro features**.

## Positioning
"Your films, presented like a cinema." Other players are built around *playing a file*; Magic Lanterns is built around *the evening*: the room dims, the library feels like a streaming service you own, and the app knows your films well enough to search what's said in them.

## Free vs Pro

**Free, forever** (the promise stays true; nothing that's free today moves to Pro):
- Library, artwork and details, every format, subtitles, Skip Intro, Up Next, cast pages, themes, discover rows, equaliser and every setting that exists today.

**Pro** ($5 a month, $24 a year shown as "$2/month", or $50 lifetime; 14-day free trial, no card needed to start):

| Feature | What it is | Why nobody else has it |
|---|---|---|
| **Cinema Mode** | A second, 10-foot interface (like a console's big-screen mode): the window becomes a theatre, the house lights dim, the selected film's poster is lit by a projector beam, full Xbox/PlayStation controller support, ambient score, a curtain-open animation into playback. An idle poster wall plays when nothing is selected. | Desktop players only shrink or enlarge the same interface. None turn the PC into a living-room theatre. |
| **Scene Search** | Type a line ("I'll be back"), see every scene across the whole library where it's said, with a still and a timestamp; Enter plays from that moment. Built from the subtitles we already read. | No consumer player searches *inside* films. |
| **Skip Recap and Credits** | Extends the Skip Intro listener: "Previously on…" is found by matching the last episode's audio; end credits by the shared closing theme, so Up Next appears exactly when credits start. | Others need hand-marked databases or only do intros. |
| **Clip & Share** | Mark in/out while watching, export a clip, GIF or still in one click, with subtitles burned in if wanted. | Players screenshot; none make shareable clips. |
| **Phone Remote** | Scan a QR code and the phone becomes a remote with artwork, scrubbing and track pickers. Works on your Wi-Fi only, no account, nothing leaves the house. | Others need an account and a cloud service. |
| **Ambient Light** | The picture's edge colours glow softly around the video in windowed mode (like bias lighting behind a TV). | Rare on desktop; never this subtle. |
| **Your Year in Film** | A Wrapped-style story: hours watched, favourite genres, most-watched actor, longest binge, shareable cards. Computed on the PC. | Streaming services do this; no local player does. Free marketing every December. |
| **Smart Organise** | Rename and file messy downloads into clean "Title (Year)" and "Show/Season 01" folders, with a preview and undo. | Usually a separate paid tool. |
| **Dialogue Boost & Night Mode** | Lifts voices and evens out loud explosions for late-night watching. | Built in, one key. |

Pro features are added one per release after launch, so every update gives a reason to upgrade and to talk about it.

## Pricing, honestly
- **$5/month vs $24/year:** the yearly plan is 60% cheaper, so almost everyone will choose yearly. That's healthy (less churn, money up front). Monthly mainly makes yearly look good.
- **$50 lifetime** is about two years of yearly. Good for launch hype; consider raising it to $59–69 after the first few months.
- **Store cut:** Microsoft takes **15%** of in-app purchases and subscriptions for apps (12% for games). Microsoft also allows non-game apps to use their own payments and pay **0%** to the Store. Either way, payment providers take their own share.
- **Launch offer:** lifetime at $39 for the first two weeks. That gives people a reason to act now, and makes a good post.

## Microsoft Store, what changes
- **Package:** MSIX via electron-builder `appx` target. Microsoft signs Store packages, so **the "Windows protected your PC" warning disappears** for Store installs (no paid certificate needed).
- **Updates:** the Store updates Store installs; the in-app updater stays only for the direct-download build.
- **Account:** Partner Center developer account (free for individuals at the time of writing; confirm at sign-up). Needs identity verification.
- **Listing needs:** privacy policy URL (a page on the releases repo, free), age rating questionnaire, 4–10 screenshots (we have them), a short trailer (your specialty), description, search keywords.
- **Trials and subscriptions:** Store add-ons support free trials and subscriptions natively; the app checks entitlement through the Windows Store API (a small native helper, since Electron can't call it directly). **Main technical risk; prototype it first.**

## Licensing design (works offline, fair, not paranoid)
- One `entitlement` module: `free | trial(daysLeft) | pro(plan, renews)`. Every Pro feature asks it; nothing else knows about money.
- Trial starts on first launch of a Pro feature (not install), 14 days, stored by the Store.
- Offline: a verified entitlement is trusted for 30 days, so flights and cabins still work.
- When a trial ends: Pro features show a beautiful preview with an "Unlock" card, never nag screens, never popups over a film.

## More Info page, enhanced
1. **Your plan:** Free / Trial (days left, progress ring) / Pro (plan, renewal date, Manage).
2. **What's new:** the latest release notes, beautifully set, with a "See all" history.
3. **Your library at a glance:** films, shows, hours watched, storage used.
4. **Pro showcase:** each Pro feature as a short looping preview card.
5. **Privacy promise:** "Your library never leaves your PC." The one-line truth that sells.
6. **Help & feedback:** keyboard shortcuts, send feedback, report a problem (opens email with logs attached on request).
7. **Credits & about me** (kept). The Ko-fi tip jar is replaced by Pro (one way to support, clearer for the Store).

## Roadmap

**Phase A: finish v1 (Free)**
1. Step 16: first-run setup with a live first scan, typo-tolerant search, collections.
2. Full-app QA pass with your library; fix everything you find (your testing round).
3. Store build: MSIX packaging, Store-only switches (no self-updater), privacy page, listing text.

**Phase B: Store launch (Free)**
4. Partner Center submission, certification, launch. Ratings and reviews start counting from day one.

**Phase C: Pro infrastructure**
5. Entitlement module, Store add-ons (monthly, yearly, lifetime) with 14-day trial, Unlock cards, the enhanced More Info page.

**Phase D: Pro features, one per release**
6. Cinema Mode (the flagship and the trailer).
7. Scene Search. 8. Skip Recap & Credits. 9. Phone Remote. 10. Clip & Share. 11. Ambient Light. 12. Year in Film (ship in December). 13. Smart Organise. 14. Dialogue Boost & Night Mode.

**Phase E: Growth (only after your approval of every post)**
Reddit (r/PleX alternatives, r/Windows11, r/software, r/anime), X, YouTube trailer, Product Hunt launch for Cinema Mode.

**Later:** Mac version (after everything above), Blu-ray picture subtitles.

## Costs (all flagged)
- Microsoft Store account: free for individuals (verify at sign-up).
- Store commission: 15% of Pro revenue (or payment-provider fees if using your own payments).
- Everything else stays on free tiers: TMDB, OMDb, Cloudflare Workers, GitHub.
