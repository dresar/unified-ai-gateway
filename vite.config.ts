import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
// Di Vercel: npm run build -> mode=production, output ke dist; rewrites di vercel.json.
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    base: "/",
    envDir: ".",
    define: {
      "import.meta.env.MODE": JSON.stringify(mode),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: { overlay: false },
      proxy: isProd
        ? undefined
        : {
            "/api": { target: "http://localhost:8787", changeOrigin: true },
            "/gateway": { target: "http://localhost:8787", changeOrigin: true },
            "/healthz": { target: "http://localhost:8787", changeOrigin: true },
            "/openapi.json": { target: "http://localhost:8787", changeOrigin: true },
            "/ws": { target: "ws://localhost:8787", ws: true, changeOrigin: true },
          },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: !isProd,
      rollupOptions: isProd
        ? {
            output: {
              manualChunks: undefined,
            },
          }
        : undefined,
    },
    plugins: [react()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
