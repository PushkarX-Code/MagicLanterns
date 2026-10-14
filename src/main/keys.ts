// Metadata API keys, injected at build time from .env (see .env.example). They live only in the main
// process, so the renderer never sees them; metadata requests are made from here (Phase 3).
export const TMDB_API_KEY: string = import.meta.env.MAIN_VITE_TMDB_API_KEY ?? ''
export const OMDB_API_KEY: string = import.meta.env.MAIN_VITE_OMDB_API_KEY ?? ''

export const hasMetadataKeys = (): boolean => TMDB_API_KEY.length > 0
