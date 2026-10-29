import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()], build: { outDir: "dist-app" }, server: { port: 5173, open: false, host: true } });
