#!/usr/bin/env node
// Download the accepted Work pictures listed in media.json and check each one's sha256.
//
//   node fetch.mjs media.json [--out src]
//
// media.json: {"files": [{"name": "look_dad.png", "url": "https://...", "sha256": "<64 hex>"}, ...]}
// A file already on disk with the right checksum is kept. Exit 1 when any download fails or differs.
// Nothing here changes a Work, spends credits or posts anything.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const listFile = args.find(arg => !arg.startsWith("--"));
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : "src";
if (!listFile || !outDir) {
  console.error("usage: node fetch.mjs media.json [--out src]");
  process.exit(2);
}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function readList(file) {
  const list = JSON.parse(readFileSync(file, "utf8"));
  const files = Array.isArray(list) ? list : list.files;
  if (!Array.isArray(files) || !files.length) throw new Error(`${file}: expected {"files": [...]} with at least one entry`);
  const names = new Set();
  for (const [index, entry] of files.entries()) {
    const where = `${file}: files[${index}]`;
    if (!entry || typeof entry.name !== "string" || !/^[\w.-]+$/.test(entry.name)) throw new Error(`${where}: name must be a plain file name`);
    if (names.has(entry.name)) throw new Error(`${where}: ${entry.name} is listed twice`);
    names.add(entry.name);
    if (typeof entry.url !== "string" || !/^https:\/\//.test(entry.url)) throw new Error(`${where}: url must be https`);
    if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error(`${where}: sha256 must be 64 lowercase hex characters`);
  }
  return files;
}

async function download(url, attempts = 4) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // The media host rejects requests without a browser-like User-Agent.
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (vixel-motion kit)" }, redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error;
      if (attempt < attempts) await sleep(500 * 2 ** attempt);
    }
  }
  throw last;
}

let files;
try { files = readList(listFile); } catch (error) { console.error(error.message); process.exit(2); }
mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const entry of files) {
  const target = path.join(outDir, entry.name);
  if (existsSync(target) && sha256(readFileSync(target)) === entry.sha256) { console.log(`kept ${target}`); continue; }
  try {
    const bytes = await download(entry.url);
    const got = sha256(bytes);
    if (got !== entry.sha256) throw new Error(`sha256 ${got} is not the ${entry.sha256} the Job reported`);
    writeFileSync(`${target}.part`, bytes);
    renameSync(`${target}.part`, target);
    console.log(`ok   ${target} (${bytes.length} bytes)`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${entry.name}: ${error.message}`);
  }
}
if (failed) { console.error(`${failed} of ${files.length} files failed; nothing was renamed over a good copy.`); process.exit(1); }
console.log(`${files.length} files match their checksums.`);
