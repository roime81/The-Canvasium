/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CANVASIUM_AI_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
