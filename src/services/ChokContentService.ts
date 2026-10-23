import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { chokInstallPresent, chokRootDirectory, chokVersionDirectory, deleteChokFiles } from '@/services/chokFiles';
import { clearChokCache } from '@/services/SiddurService';
import { reportError } from '@/services/errors';
import { CHOK_PARASHIYOT, CHOK_TEXT_ID } from '@/data/chok';
import { IDLE_DOWNLOAD, useChokStore } from '@/stores/useChokStore';
import { selectActive, useMitzvotStore } from '@/stores/useMitzvotStore';
import { ChokFailureReason, ChokManifest, ChokManifestFile } from '@/types/chok';

export const CHOK_BASE_URL = 'https://jew-365.github.io/jew-365/chok/';
export const CHOK_MANIFEST_URL = `${CHOK_BASE_URL}manifest.json`;
export const CHOK_FORMAT = 1;
export const CHOK_FILE_ATTEMPTS = 3;
export const CHOK_RETRY_DELAY_MS = 1000;
export const CHOK_REQUEST_TIMEOUT_MS = 30_000;
export const CHOK_CHECK_INTERVAL_MS = 86_400_000;
export const CHOK_SPACE_MARGIN_BYTES = 50_000_000;
export const CHOK_SIZE_ESTIMATE_MB = 19;
export const CHOK_SPACE_NEEDED_MB = CHOK_SIZE_ESTIMATE_MB + CHOK_SPACE_MARGIN_BYTES / 1_000_000;

const PATH_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\.[0-9a-f]{8}\.json$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export class ChokDownloadError extends Error {
  constructor(readonly reason: ChokFailureReason | 'cancelled') {
    super(`chok download ${reason}`);
    this.name = 'ChokDownloadError';
  }
}

let running: Promise<boolean> | null = null;
let controller: AbortController | null = null;

export function chokDownloadSupported(): boolean {
  return Platform.OS !== 'web';
}

export function chokMegabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function parseChokManifest(raw: unknown): ChokManifest {
  const unavailable = () => new ChokDownloadError('unavailable');
  if (!isRecord(raw) || raw.format !== CHOK_FORMAT) throw unavailable();
  const { version, credit, license, bytes, files } = raw;
  if (!Number.isInteger(version) || (version as number) < 1) throw unavailable();
  if (!isRecord(credit) || typeof credit.he !== 'string' || typeof credit.en !== 'string') throw unavailable();
  if (
    !isRecord(license) ||
    typeof license.name !== 'string' ||
    typeof license.url !== 'string' ||
    typeof license.urlHe !== 'string'
  ) {
    throw unavailable();
  }
  if (!isRecord(files)) throw unavailable();
  if (Object.keys(files).length !== CHOK_PARASHIYOT.length || !CHOK_PARASHIYOT.every((parasha) => parasha in files)) {
    throw unavailable();
  }
  let sum = 0;
  for (const parasha of CHOK_PARASHIYOT) {
    const file = files[parasha];
    if (
      !isRecord(file) ||
      typeof file.path !== 'string' ||
      !PATH_PATTERN.test(file.path) ||
      typeof file.sha256 !== 'string' ||
      !HASH_PATTERN.test(file.sha256) ||
      !Number.isInteger(file.bytes) ||
      (file.bytes as number) < 1
    ) {
      throw unavailable();
    }
    sum += file.bytes as number;
  }
  if (bytes !== sum) throw unavailable();
  return raw as unknown as ChokManifest;
}

export async function fetchChokManifest(): Promise<ChokManifest> {
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), CHOK_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${CHOK_MANIFEST_URL}?t=${Date.now()}`, { signal: aborter.signal });
  } catch {
    throw new ChokDownloadError('offline');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new ChokDownloadError('unavailable');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    throw new ChokDownloadError('unavailable');
  }
  return parseChokManifest(parsed);
}

function failWith(error: unknown): void {
  if (error instanceof ChokDownloadError && error.reason !== 'cancelled') {
    useChokStore.getState().setDownload({ status: 'failed', reason: error.reason });
    return;
  }
  reportError('storage', error);
  useChokStore.getState().setDownload({ status: 'failed', reason: 'unavailable' });
}

export async function prepareChokDownload(): Promise<ChokManifest | null> {
  const store = useChokStore.getState();
  if (!chokDownloadSupported() || store.download.status === 'downloading') return null;
  store.setDownload(IDLE_DOWNLOAD);
  try {
    const manifest = await fetchChokManifest();
    useChokStore.getState().setChecked(manifest.version, Date.now());
    return manifest;
  } catch (error) {
    failWith(error);
    return null;
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });
}

async function fetchOnce(file: ChokManifestFile, signal: AbortSignal): Promise<string> {
  const request = new AbortController();
  const timer = setTimeout(() => request.abort(), CHOK_REQUEST_TIMEOUT_MS);
  const onAbort = () => request.abort();
  signal.addEventListener('abort', onAbort);
  try {
    let response: Response;
    try {
      response = await fetch(CHOK_BASE_URL + file.path, { signal: request.signal });
    } catch {
      throw new ChokDownloadError(signal.aborted ? 'cancelled' : 'offline');
    }
    if (!response.ok) throw new ChokDownloadError('unavailable');
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new ChokDownloadError('offline');
    }
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
    if (digest.toLowerCase() !== file.sha256) throw new ChokDownloadError('integrity');
    return text;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

async function fetchVerified(file: ChokManifestFile, signal: AbortSignal): Promise<string> {
  let failure = new ChokDownloadError('offline');
  for (let attempt = 1; attempt <= CHOK_FILE_ATTEMPTS; attempt++) {
    if (attempt > 1) await pause(CHOK_RETRY_DELAY_MS * (attempt - 1), signal);
    if (signal.aborted) throw new ChokDownloadError('cancelled');
    try {
      return await fetchOnce(file, signal);
    } catch (error) {
      if (!(error instanceof ChokDownloadError)) throw error;
      if (signal.aborted || error.reason === 'cancelled') throw new ChokDownloadError('cancelled');
      failure = error;
    }
  }
  throw failure;
}

function switchChokOff(): void {
  if (selectActive(CHOK_TEXT_ID)(useMitzvotStore.getState()).enabled) {
    useMitzvotStore.getState().setEnabled(CHOK_TEXT_ID, false);
  }
}

function forgetChokInstall(): void {
  useChokStore.getState().clearInstalled();
  clearChokCache();
  switchChokOff();
}

function discardPartial(manifest: ChokManifest): void {
  if (useChokStore.getState().installed?.version === manifest.version) return;
  try {
    const directory = chokVersionDirectory(manifest.version);
    if (directory.exists) directory.delete();
  } catch {}
}

async function run(manifest: ChokManifest, signal: AbortSignal): Promise<void> {
  const { setDownload, setInstalled, setChecked } = useChokStore.getState();
  const total = CHOK_PARASHIYOT.length;
  setDownload({ status: 'downloading', done: 0, total, bytes: 0, totalBytes: manifest.bytes });
  if (Paths.availableDiskSpace < manifest.bytes + CHOK_SPACE_MARGIN_BYTES) throw new ChokDownloadError('space');
  const target = chokVersionDirectory(manifest.version);
  if (useChokStore.getState().installed?.version === manifest.version) {
    useChokStore.getState().clearInstalled();
    clearChokCache();
  }
  try {
    if (target.exists) target.delete();
    target.create({ intermediates: true });
  } catch {
    throw new ChokDownloadError('storage');
  }
  let bytes = 0;
  for (const [index, parasha] of CHOK_PARASHIYOT.entries()) {
    const file = manifest.files[parasha];
    const text = await fetchVerified(file, signal);
    try {
      new File(target, file.path).write(text);
    } catch {
      throw new ChokDownloadError('storage');
    }
    bytes += file.bytes;
    setDownload({ status: 'downloading', done: index + 1, total, bytes, totalBytes: manifest.bytes });
  }
  if (signal.aborted) throw new ChokDownloadError('cancelled');
  setInstalled({
    version: manifest.version,
    bytes: manifest.bytes,
    installedAt: Date.now(),
    files: Object.fromEntries(CHOK_PARASHIYOT.map((parasha) => [parasha, manifest.files[parasha].path])),
  });
  setChecked(manifest.version, Date.now());
  for (const entry of chokRootDirectory().list()) {
    if (entry.name === `v${manifest.version}`) continue;
    try {
      entry.delete();
    } catch (error) {
      reportError('storage', error);
    }
  }
  clearChokCache();
  setDownload(IDLE_DOWNLOAD);
}

async function guardedRun(manifest: ChokManifest, signal: AbortSignal): Promise<boolean> {
  try {
    await run(manifest, signal);
    return true;
  } catch (error) {
    discardPartial(manifest);
    if (error instanceof ChokDownloadError && error.reason === 'cancelled') {
      useChokStore.getState().setDownload(IDLE_DOWNLOAD);
    } else {
      failWith(error);
    }
    return false;
  }
}

export function installChok(manifest: ChokManifest): Promise<boolean> {
  if (running) return running;
  if (!chokDownloadSupported()) return Promise.resolve(false);
  const aborter = new AbortController();
  controller = aborter;
  running = guardedRun(manifest, aborter.signal).finally(() => {
    running = null;
    controller = null;
  });
  return running;
}

export function cancelChokDownload(): void {
  controller?.abort();
}

export function deleteChok(): void {
  cancelChokDownload();
  forgetChokInstall();
  try {
    deleteChokFiles();
  } catch (error) {
    reportError('storage', error);
  }
}

export async function checkChokUpdate(now: number = Date.now()): Promise<void> {
  const { installed, download, checkedAt } = useChokStore.getState();
  if (!chokDownloadSupported() || installed === null || download.status === 'downloading') return;
  if (checkedAt !== null && now - checkedAt < CHOK_CHECK_INTERVAL_MS) return;
  try {
    const manifest = await fetchChokManifest();
    useChokStore.getState().setChecked(manifest.version, now);
  } catch {
    const state = useChokStore.getState();
    if (state.installed) state.setChecked(state.latestVersion ?? state.installed.version, now);
  }
}

export function verifyChokInstall(): boolean {
  const { installed } = useChokStore.getState();
  if (installed === null) return false;
  if (chokInstallPresent(installed)) return true;
  forgetChokInstall();
  return false;
}

export function reconcileChokInstall(): void {
  try {
    if (running !== null || !chokDownloadSupported()) return;
    const { installed } = useChokStore.getState();
    if (installed !== null && !chokInstallPresent(installed)) forgetChokInstall();
    const current = useChokStore.getState().installed;
    if (current === null) switchChokOff();
    const root = chokRootDirectory();
    if (!root.exists) return;
    for (const entry of root.list()) {
      if (current !== null && entry.name === `v${current.version}`) continue;
      try {
        entry.delete();
      } catch (error) {
        reportError('storage', error);
      }
    }
  } catch (error) {
    reportError('storage', error);
  }
}
