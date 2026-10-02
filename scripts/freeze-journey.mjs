import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "output/journey/frozen-build.json");
const paths = [
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "playwright.config.ts",
];
async function collect(dir) {
  for (const entry of await readdir(resolve(root, dir), {
    withFileTypes: true,
  })) {
    if (entry.name === ".DS_Store") continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) paths.push(path);
  }
}
for (const dir of ["src", "tests", "scripts", "public"]) await collect(dir);
paths.sort();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const versionSource = await readFile(
  resolve(root, "src/journey/types.ts"),
  "utf8",
);
const version = (name) => {
  const match = versionSource.match(
    new RegExp(`export const ${name} = (\\d+);`),
  );
  if (!match) throw new Error(`Missing ${name} in journey types`);
  return Number(match[1]);
};
const files = {};
const combined = createHash("sha256");
for (const path of paths) {
  const content = await readFile(resolve(root, path));
  files[path] = hash(content);
  combined.update(`${path}\0${files[path]}\n`);
}
const result = {
  ruleVersion: version("RULE_VERSION"),
  generatorVersion: version("GENERATOR_VERSION"),
  sourceHash: combined.digest("hex"),
  offlineHash: hash(await readFile(resolve(root, "dist/果冻果园.html"))),
  files,
};
if (process.argv[2] === "verify") {
  const frozen = JSON.parse(await readFile(output, "utf8"));
  if (
    result.sourceHash !== frozen.sourceHash ||
    result.offlineHash !== frozen.offlineHash
  ) {
    const changed = [
      ...new Set([...Object.keys(frozen.files), ...paths]),
    ].filter((p) => frozen.files[p] !== files[p]);
    console.error(
      JSON.stringify(
        {
          status: "changed",
          changed,
          sourceHash: result.sourceHash,
          offlineHash: result.offlineHash,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify({
        status: "unchanged",
        sourceHash: result.sourceHash,
        offlineHash: result.offlineHash,
      }),
    );
} else if (process.argv[2] === "create") {
  await mkdir(resolve(root, "output/journey"), { recursive: true });
  await writeFile(
    output,
    JSON.stringify({ frozenAt: new Date().toISOString(), ...result }, null, 2) +
      "\n",
  );
  console.log(
    JSON.stringify({
      status: "frozen",
      path: relative(root, output),
      sourceHash: result.sourceHash,
      offlineHash: result.offlineHash,
    }),
  );
} else {
  console.error("Usage: node scripts/freeze-journey.mjs create|verify");
  process.exitCode = 2;
}
