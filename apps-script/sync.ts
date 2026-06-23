#!/usr/bin/env bun
/**
 * Pull/push the container-bound Apps Script project via the `gws` CLI,
 * mirroring clasp's workflow.
 *
 *   bun run apps-script/sync.ts pull          # remote -> ./apps-script/src
 *   bun run apps-script/sync.ts push          # ./apps-script/src -> remote (replaces ALL files)
 *   bun run apps-script/sync.ts push --dry-run # validate without writing
 *
 * The script id comes from GOOGLE_APP_SCRIPT_ID in .env (Bun loads it automatically).
 * `updateContent` clears the whole project, so push always sends the full file set.
 */
import { readdir, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";

const SRC_DIR = join(dirname(Bun.fileURLToPath(import.meta.url)), "src");

/** Apps Script File.type <-> local extension. The manifest is always JSON named "appsscript". */
const TYPE_TO_EXT: Record<string, string> = {
  SERVER_JS: ".gs",
  HTML: ".html",
  JSON: ".json",
};
const EXT_TO_TYPE: Record<string, string> = {
  ".gs": "SERVER_JS",
  ".js": "SERVER_JS",
  ".html": "HTML",
  ".json": "JSON",
};

type ScriptFile = { name: string; type: string; source: string };

function scriptId(): string {
  const id = process.env.GOOGLE_APP_SCRIPT_ID;
  if (!id) throw new Error("GOOGLE_APP_SCRIPT_ID is not set (check .env)");
  return id;
}

/** Run `gws` via the local dependency, returning stdout. Throws on non-zero exit. */
async function gws(args: string[]): Promise<string> {
  const proc = Bun.spawn(["bunx", "gws", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`gws ${args.join(" ")} failed (${code}):\n${stderr || stdout}`);
  return stdout;
}

async function pull() {
  const out = await gws([
    "script",
    "projects",
    "getContent",
    "--params",
    JSON.stringify({ scriptId: scriptId() }),
    "--format",
    "json",
  ]);
  const content = JSON.parse(out) as { files: ScriptFile[] };
  await mkdir(SRC_DIR, { recursive: true });
  for (const file of content.files) {
    const ext = TYPE_TO_EXT[file.type] ?? ".txt";
    const path = join(SRC_DIR, file.name + ext);
    await writeFile(path, file.source ?? "");
    console.log(`pulled  ${path} (${(file.source ?? "").length} chars)`);
  }
}

async function push(dryRun: boolean) {
  const entries = await readdir(SRC_DIR);
  const files: ScriptFile[] = [];
  for (const entry of entries) {
    const ext = extname(entry);
    const type = EXT_TO_TYPE[ext];
    if (!type) continue; // skip anything that isn't a script file
    const source = await readFile(join(SRC_DIR, entry), "utf8");
    files.push({ name: basename(entry, ext), type, source });
  }
  if (!files.some((f) => f.name === "appsscript" && f.type === "JSON")) {
    throw new Error(`Refusing to push: ${SRC_DIR}/appsscript.json (the manifest) is missing`);
  }
  for (const f of files) console.log(`pushing ${f.name}${TYPE_TO_EXT[f.type]} (${f.source.length} chars)`);

  await gws([
    "script",
    "projects",
    "updateContent",
    "--params",
    JSON.stringify({ scriptId: scriptId() }),
    "--json",
    JSON.stringify({ files }),
    ...(dryRun ? ["--dry-run"] : []),
  ]);
  console.log(dryRun ? "dry-run OK (nothing written)" : "pushed.");
}

const [cmd, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");

if (cmd === "pull") await pull();
else if (cmd === "push") await push(dryRun);
else {
  console.error("usage: bun run apps-script/sync.ts <pull|push> [--dry-run]");
  process.exit(1);
}
