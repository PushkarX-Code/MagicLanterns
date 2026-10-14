/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_TMDB_API_KEY?: string
  readonly MAIN_VITE_OMDB_API_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
