import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {resolve} from "node:path";
const surface=process.env.ONCLASSTIME_SURFACE??"desktop";
export default defineConfig({
  resolve:{alias:{"@product-entry":resolve(surface==="admin"?"src/surfaces/AdminPortal.tsx":surface==="download"?"src/surfaces/Download.tsx":"src/App.tsx")}},
  plugins: [react()],
  server: {
    watch: { ignored: ["**/installer/generated/**", "**/release/**", "**/desktop-app/**", "**/build/**", "**/prisma/*.db*"] },
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4310" },
  },
  build: { outDir: surface==="admin"?"admin-site/dist":"dist", chunkSizeWarningLimit: 1100 },
});
