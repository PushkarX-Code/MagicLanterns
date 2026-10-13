# Magic Lanterns

A premium local media player for Windows. Infuse-level playback, Apple TV-level design.

> The magic lantern was the first projector: a light, a painted glass slide, and a dark room turned into a story.
> Magic Lanterns does the same to a folder of files.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Shell: design system, icon, splash, sidebar, Home, Detail, Player, motion, skeletons (mock data) | **Done** |
| 2 | Library engine: scan, ffprobe, parsing, SQLite, watcher | Next |
| 3 | Metadata: TMDB, OMDb, image cache, Fix Match | |
| 4 | Player: FFmpeg streaming, subtitles, audio tracks, progress | |
| 5 | Polish: search, collections, onboarding, installer | |

See [PLAN.md](PLAN.md) for the full architecture.

## Run it (Windows)

Requires [Node.js 20+](https://nodejs.org).

```bash
npm install
npm run dev
```

The first `npm install` downloads Electron (~100 MB).

Other scripts:

| Command | Does |
|---|---|
| `npm run dev` | Launch with hot reload |
| `npm run build` | Production bundle into `out/` |
| `npm run preview` | Run the production bundle |
| `npm run typecheck` | TypeScript check for main + renderer |
| `npm run icons` | Rebuild `build/icon.ico` and PNGs from `build/icon-src/*.svg` |
| `npm run dist` | Build the Windows NSIS installer into `release/` |

## Phase 1 notes

- **Mock library:** 12 films and 4 series with real TMDB metadata and artwork (`src/renderer/src/mock/tmdb-fixture.json`).
  Artwork loads from TMDB's image CDN, so an internet connection shows the real posters. Offline, every card falls back to its color and title.
- **Playback:** every title plays an open Blender Foundation film as a stand-in. Drag any `.mp4` / `.webm` onto the player to watch your own file.
- **Skeletons:** Settings → Developer → *Simulate Slow Network* slows every load so the skeleton → content flow can be judged.

## Controls

| Where | Keys |
|---|---|
| Everywhere | Arrows move focus · Enter selects · Esc / Backspace goes back (at a section root it opens the sidebar) |
| Home hero | Right arrow on *More Info* moves to the next slide |
| Player | Space play/pause · ← → seek 10s · ↑ ↓ volume · F fullscreen · M mute · S subtitles · Esc close |

The mouse works everywhere: hover focuses, click selects, the scrubber shows frame previews.
