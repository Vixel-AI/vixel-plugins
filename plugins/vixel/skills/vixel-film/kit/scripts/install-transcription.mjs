#!/usr/bin/env node
// Optional: installs faster-whisper into the kit's own virtual environment, ~/.vixel/whisper (Windows: %USERPROFILE%\.vixel\whisper),
// so transcribe.mjs can check spoken lines. Needs Python 3.9+ with venv; no sudo, nothing outside that folder. Downloads about 200 MB
// of packages; the first transcription then downloads the speech model (about 500 MB) into the kit cache.
// Usage: node install-transcription.mjs [--python python3] [--check]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KitError, parseArgs, isMain, runMain, run, transcriptionVenv, systemPythons, installHint, userCacheDir, FASTER_WHISPER } from './lib.mjs';

export const MIN_PYTHON = [3, 9];
const PIP_ENV = { PIP_USER: '0', PIP_NO_INPUT: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' };
const tail = text => String(text).trim().split('\n').slice(-3).join(' | ');

// "3.12" from a working interpreter, null when it does not run.
export async function pythonVersion(python) {
  const result = await run(python, ['-I', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], { timeout: 60000 });
  return result.code ? null : result.stdout.trim().match(/^(\d+)\.(\d+)$/)?.[0] ?? null;
}
export const versionOk = version => { const [a, b] = String(version).split('.').map(Number); return a > MIN_PYTHON[0] || (a === MIN_PYTHON[0] && b >= MIN_PYTHON[1]); };

export async function whisperVersion(python) {
  const result = await run(python, ['-I', '-c', 'import faster_whisper; print(getattr(faster_whisper, "__version__", ""))'], { timeout: 120000 });
  return result.code ? null : result.stdout.trim() || 'unknown';
}

// The first usable Python 3.9+ among --python or the system ones.
export async function basePython(candidates, platform = process.platform) {
  const seen = [];
  for (const python of candidates) {
    const version = await pythonVersion(python);
    if (version && versionOk(version)) return python;
    if (version) seen.push(`${python} is ${version}`);
  }
  const need = `Python ${MIN_PYTHON.join('.')} or later`;
  throw new KitError('PYTHON_REQUIRED', `${seen.length ? `${seen.join('; ')}; transcription needs ${need}.` : `No ${need} found (tried ${candidates.join(', ')}).`} Install it (${installHint('python', platform)}), open a new terminal, then run this again. Transcription is optional: without it, listen to every clip.`, 3);
}

export async function installTranscription({ python = null, check = false, home = os.homedir(), platform = process.platform } = {}) {
  const venv = transcriptionVenv(home, platform), cache = path.join(userCacheDir(), 'whisper');
  const status = { venv: venv.dir, python: venv.python, package: FASTER_WHISPER, modelCache: cache };
  const existing = await whisperVersion(venv.python);
  if (existing) return { ok: true, installed: true, alreadyInstalled: true, ...status, version: existing, next: 'Run transcribe.mjs.' };
  if (check) return { ok: true, check: true, installed: false, ...status, next: 'Run install-transcription.mjs without --check to install it.' };
  const base = await basePython(python ? [python] : systemPythons(platform), platform);
  // The folder belongs to this kit and holds no faster-whisper yet: rebuild it for an explicit --python, or when its
  // interpreter no longer runs (for example after a Python upgrade).
  if (python || !(await pythonVersion(venv.python))) {
    console.error(`creating ${venv.dir} with ${base}`);
    fs.mkdirSync(path.dirname(venv.dir), { recursive: true });
    const made = await run(base, ['-m', 'venv', '--clear', venv.dir], { timeout: 300000 });
    if (made.code || !(await pythonVersion(venv.python))) throw new KitError('PYTHON_VENV_FAILED', `${base} -m venv failed: ${tail(made.stderr || made.stdout)}. ${platform === 'linux'
      ? 'On Debian/Ubuntu install the venv module (sudo apt install python3-venv)' : `Install a full Python 3 (${installHint('python', platform)})`}, then run this again.`, 3);
  }
  console.error(`installing ${FASTER_WHISPER} into ${venv.dir} (about 200 MB, a few minutes)`);
  await run(venv.python, ['-m', 'pip', 'install', '--no-cache-dir', '--upgrade', 'pip'], { timeout: 600000, env: PIP_ENV });
  const pip = await run(venv.python, ['-m', 'pip', 'install', '--no-cache-dir', FASTER_WHISPER], { timeout: 30 * 60000, env: PIP_ENV });
  const version = await whisperVersion(venv.python);
  if (pip.code || !version) throw new KitError('TRANSCRIPTION_INSTALL_FAILED', `pip could not install ${FASTER_WHISPER}: ${tail(pip.stderr || pip.stdout)}. Check network access; if this Python is very new, install Python 3.12 and run again with --python <it>.`);
  return { ok: true, installed: true, ...status, version, base,
    next: `Run transcribe.mjs. The first transcription downloads the speech model (about 500 MB for small) into ${cache}; later runs reuse it.` };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2), { bools: ['check'] });
  return installTranscription({ python: flags.python || null, check: flags.check === true });
});
