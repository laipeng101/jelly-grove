import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
let html = await readFile(new URL("dist/index.html", root), "utf8");
const script = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[0];
const css = html.match(/<link[^>]+rel="stylesheet"[^>]*>/)?.[0];
if (!script || !css) throw new Error("Production assets missing");
const jsPath = script.match(/src="([^"]+)"/)[1];
const cssPath = css.match(/href="([^"]+)"/)[1];
const js = await readFile(new URL("dist" + jsPath, root), "utf8");
const styles = await readFile(new URL("dist" + cssPath, root), "utf8");
const favicon = await readFile(new URL("public/favicon.svg", root), "utf8");
html = html
  .replace(
    script,
    () =>
      `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`,
  )
  .replace(css, () => `<style>${styles}</style>`)
  .replace(
    'href="/favicon.svg"',
    () => `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`,
  );
await writeFile(new URL("dist/果冻果园.html", root), html);
console.log("Offline game created: dist/果冻果园.html");
