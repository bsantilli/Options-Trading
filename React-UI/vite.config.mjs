// <reference types="vitest" />
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // optional alias
    },
  },
  server: {
    port: 3000,
    open: true,
    // Proxy your Node server (adjust paths/port as needed)
    proxy: {
      // forward /api/* to http://localhost:5000
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts", // or .js if you use JS
  },
});
