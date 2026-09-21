import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  server: { fs: { strict: true } },
  build: { target: "es2022" },
});
