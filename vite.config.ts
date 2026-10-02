import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      watch: {
        // Abaikan perubahan pada file database JSON agar Vite tidak merestart browser
        ignored: [
          "**/ai_config.json",
          "**/stats.json",
          "**/accounts.json",
          "**/settings.json",
          "**/account_settings.json",
        ],
      },
    },
  };
});
