import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const GATEWAY_URL = process.env.VAANI_GATEWAY_URL || "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: GATEWAY_URL,
        changeOrigin: true,
      },
    },
  },
});
