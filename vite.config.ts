import { defineConfig } from "vite";

export default defineConfig({
  // Deployed under https://<user>.github.io/ancient_paths/ — relative paths
  // keep every asset reachable from that subpath.
  base: "./",
  build: {
    target: "es2022",
  },
});
