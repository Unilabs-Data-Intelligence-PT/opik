/// <reference types="vitest" />
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import react from "@vitejs/plugin-react-swc";
import * as path from "path";
import { defineConfig, loadEnv, UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";

// https://vitejs.dev/config https://vitest.dev/config
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: env.VITE_BASE_URL || "/",
    plugins: [
      svgr({
        svgrOptions: {
          icon: true,
        },
      }),
      react(),
      tsconfigPaths(),
      TanStackRouterVite({ enableRouteGeneration: false }),
    ],
    test: {
      globals: true,
      environment: "happy-dom",
      setupFiles: ".vitest/setup",
      include: ["**/*.test.{ts,tsx}"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: true,
    },
    server: {
      hmr: false,
      host: "0.0.0.0",
      port: 5174,
      proxy: {
        "/api/testrunner": {
          target: "http://localhost:8001",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => {
            console.log("testRunner yay", path);
            return path.replace(/^\/api\/testrunner/, "");
          },
        },
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => {
            return path.replace(/^\/api/, "");
          },
        },
      },
    },
  } satisfies UserConfig;
});
