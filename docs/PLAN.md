# Magic Lanterns — Build Plan

Premium local media player for Windows. Electron + React 18 + Vite (electron-vite), TypeScript throughout.

---

## 1. Folder structure

```
MagicLanterns/
├─ electron.vite.config.ts
├─ electron-builder.yml          NSIS installer, asarUnpack for ffmpeg/ffprobe/sqlite
├─ package.json / tsconfig.*.json
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
