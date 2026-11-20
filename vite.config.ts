import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath } from "vite";

const generatedDirectories = [".cache", "output"].map((directory) =>
  normalizePath(fileURLToPath(new URL(directory, import.meta.url))),
);

export default defineConfig({
  optimizeDeps: { entries: ["index.html"] },
  server: { watch: { ignored: generatedDirectories } },
});
