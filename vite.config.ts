import { defineConfig } from "vite";

export default defineConfig({
  // Deployed under https://<user>.github.io/ancient_paths/ — relative paths
  // keep every asset reachable from that subpath.
  base: "./",
  // Honor a PORT from the environment (the desktop app's preview launcher
  // assigns one when 5173 is busy and then opens THAT port — without this,
  // Vite picked its own 5174 and the preview pane kept pointing at an
  // empty port). strictPort keeps the two from silently diverging.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  build: {
    target: "es2022",
  },
});
