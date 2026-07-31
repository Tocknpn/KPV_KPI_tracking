// electron.vite.config.mjs
import { resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_import_meta_url = "file:///C:/Users/advice/KPV%20sale%20performance%20tracking/electron.vite.config.mjs";
var __dirname = fileURLToPath(new URL(".", __electron_vite_injected_import_meta_url));
var pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
var APP_VERSION = pkg.version;
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/main.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/preload.ts")
      }
    }
  },
  renderer: {
    root: resolve(__dirname, "src"),
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/index.html")
      }
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src")
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION)
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
