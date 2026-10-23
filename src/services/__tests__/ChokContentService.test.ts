jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/commonjs/createMMKV.mock');
  return { MMKV: jest.fn(() => createMockMMKV()) };
});

type FsEntry = { dir: boolean; text?: string };
const mockState = { space: 1e12, failWrite: false, failCreate: false, fs: new Map<string, FsEntry>() };

jest.mock('expo-file-system', () => {
  const DOCUMENT = 'file:///doc';
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  const nameOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);
  const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));
  const removeTree = (uri: string) => {
    for (const key of [...mockState.fs.keys()]) {
      if (key === uri || key.startsWith(`${uri}/`)) mockState.fs.delete(key);
    }
  };

  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockState.fs.get(this.uri)?.dir === false;
    }
    get name() {
      return nameOf(this.uri);
    }
    write(text: string) {
      if (mockState.failWrite) throw new Error('disk full');
      mockState.fs.set(this.uri, { dir: false, text });
    }
    async text() {
      return mockState.fs.get(this.uri)?.text ?? '';
    }
    delete() {
      mockState.fs.delete(this.uri);
    }
  }

  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockState.fs.get(this.uri)?.dir === true;
    }
    get name() {
      return nameOf(this.uri);
    }
    create() {
      if (mockState.failCreate) throw new Error('read only');
      for (let uri = this.uri; uri.startsWith(DOCUMENT); uri = parentOf(uri)) {
        mockState.fs.set(uri, { dir: true });
      }
    }
    delete() {
      removeTree(this.uri);
    }
    rename() {
      throw new Error('rename is never used');
    }
    list() {
      return [...mockState.fs.entries()]
        .filter(([key]) => key.startsWith(`${this.uri}/`) && !key.slice(this.uri.length + 1).includes('/'))
        .map(([key, entry]) => (entry.dir ? new Directory(key) : new File(key)));
    }
  }

  return {
    Directory,
    File,
    Paths: {
      document: { uri: DOCUMENT },
      get availableDiskSpace() {
        return mockState.space;
      },
    },
  };
});

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { CHOK_PARASHIYOT } from '@/data/chok';
import { useChokStore, selectChokUpdateAvailable } from '@/stores/useChokStore';
import { useMitzvotStore } from '@/stores/useMitzvotStore';
import type { ChokManifest } from '@/types/chok';
import {
  CHOK_BASE_URL,
  CHOK_CHECK_INTERVAL_MS,
  CHOK_MANIFEST_URL,
  CHOK_SIZE_ESTIMATE_MB,
  CHOK_SPACE_NEEDED_MB,
  ChokDownloadError,
  cancelChokDownload,
  checkChokUpdate,
  chokDownloadSupported,
  deleteChok,
  installChok,
  parseChokManifest,
  prepareChokDownload,
  reconcileChokInstall,
  verifyChokInstall,
} from '../ChokContentService';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const slug = (parasha: string) =>
  parasha
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type Fixture = { manifest: ChokManifest; bodies: Record<string, string> };

function buildFixture(version = 1): Fixture {
  const bodies: Record<string, string> = {};
  const files: ChokManifest['files'] = {};
  let total = 0;
  for (const parasha of CHOK_PARASHIYOT) {
    const body = JSON.stringify({
      parasha,
      credit: { title: 't', license: 'l', url: 'u' },
      dedication: null,
      slots: {},
      version,
    });
    const hash = sha256(body);
    const bytes = Buffer.byteLength(body, 'utf8');
    const file = `${slug(parasha)}.${hash.slice(0, 8)}.json`;
    files[parasha] = { path: file, sha256: hash, bytes };
    bodies[file] = body;
    total += bytes;
  }
  const manifest: ChokManifest = {
    format: 1,
    version,
    credit: { he: 'קרדיט', en: 'credit' },
    license: { name: 'CC BY-NC-SA 2.5', url: 'https://example.org/en', urlHe: 'https://example.org/he' },
    bytes: total,
    files,
  };
  return { manifest, bodies };
}

type Reply = { ok: boolean; status: number; text: () => Promise<string> };
type Route = (url: string, hit: number) => Reply | Promise<Reply>;

const reply = (body: string, status = 200): Reply => ({ ok: status < 400, status, text: async () => body });

let hits: string[] = [];
let route: Route;
const fetchMock = jest.fn(async (url: string) => {
  hits.push(url);
  return route(url, hits.filter((hit) => hit === url).length);
});

function serve(...fixtures: Fixture[]): Route {
  return (url) => {
    if (url.startsWith(CHOK_MANIFEST_URL)) return reply(JSON.stringify(fixtures[0].manifest));
    for (const { bodies } of fixtures) {
      const file = url.slice(CHOK_BASE_URL.length);
      if (file in bodies) return reply(bodies[file]);
    }
    return reply('', 404);
  };
}

const fileUrls = () => hits.filter((hit) => !hit.startsWith(CHOK_MANIFEST_URL));
const hitsOf = (file: string) => hits.filter((hit) => hit === CHOK_BASE_URL + file);
const has = (uri: string) => mockState.fs.has(uri);
const failedReason = () => {
  const { download } = useChokStore.getState();
  return download.status === 'failed' ? download.reason : download.status;
};

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

function expectUnavailable(run: () => unknown) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ChokDownloadError);
  expect((thrown as ChokDownloadError).reason).toBe('unavailable');
}

let v1: Fixture;
let v2: Fixture;

beforeAll(() => {
  v1 = buildFixture(1);
  v2 = buildFixture(2);
});

beforeEach(() => {
  jest.useRealTimers();
  mockState.fs.clear();
  mockState.space = 1e12;
  mockState.failWrite = false;
  mockState.failCreate = false;
  hits = [];
  route = serve(v1, v2);
  fetchMock.mockClear();
  (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  useChokStore.getState().reset();
  useMitzvotStore.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('parseChokManifest', () => {
  it('accepts a valid manifest as it is', () => {
    expect(parseChokManifest(v1.manifest)).toEqual(v1.manifest);
  });

  it('refuses a wrong format, a missing parasha, a bad path and a bytes sum that is off by one', () => {
    const clone = (): ChokManifest => JSON.parse(JSON.stringify(v1.manifest));
    expectUnavailable(() => parseChokManifest({ ...clone(), format: 2 }));
    const missing = clone();
    delete missing.files.Noach;
    expectUnavailable(() => parseChokManifest(missing));
    const badPath = clone();
    badPath.files.Noach.path = '../noach.json';
    expectUnavailable(() => parseChokManifest(badPath));
    const badHash = clone();
    badHash.files.Noach.sha256 = 'abc';
    expectUnavailable(() => parseChokManifest(badHash));
    expectUnavailable(() => parseChokManifest({ ...clone(), bytes: v1.manifest.bytes + 1 }));
    expectUnavailable(() => parseChokManifest(null));
  });
});

describe('prepareChokDownload', () => {
  it('fails offline when the request rejects', async () => {
    route = () => Promise.reject(new Error('network'));
    await expect(prepareChokDownload()).resolves.toBeNull();
    expect(useChokStore.getState().download).toEqual({ status: 'failed', reason: 'offline' });
  });

  it('fails unavailable on a 404', async () => {
    route = () => reply('', 404);
    await expect(prepareChokDownload()).resolves.toBeNull();
    expect(useChokStore.getState().download).toEqual({ status: 'failed', reason: 'unavailable' });
  });

  it('returns the manifest, records the latest version and busts the cache of the manifest URL', async () => {
    await expect(prepareChokDownload()).resolves.toEqual(v1.manifest);
    const state = useChokStore.getState();
    expect(state.latestVersion).toBe(1);
    expect(state.checkedAt).not.toBeNull();
    expect(hits[0].startsWith(`${CHOK_MANIFEST_URL}?t=`)).toBe(true);
  });
});

describe('installChok', () => {
  it('downloads every file, checks it, switches it in and reports the progress', async () => {
    const dones: number[] = [];
    let lastBytes = 0;
    const unsubscribe = useChokStore.subscribe((state, prev) => {
      if (state.download !== prev.download && state.download.status === 'downloading' && state.download.done > 0) {
        dones.push(state.download.done);
        lastBytes = state.download.bytes;
      }
    });
    await expect(installChok(v1.manifest)).resolves.toBe(true);
    unsubscribe();
    expect(fileUrls()).toEqual(CHOK_PARASHIYOT.map((parasha) => CHOK_BASE_URL + v1.manifest.files[parasha].path));
    for (const file of Object.values(v1.manifest.files)) expect(has(`file:///doc/chok/v1/${file.path}`)).toBe(true);
    expect(useChokStore.getState().installed).toEqual({
      version: 1,
      bytes: v1.manifest.bytes,
      installedAt: expect.any(Number),
      files: Object.fromEntries(CHOK_PARASHIYOT.map((parasha) => [parasha, v1.manifest.files[parasha].path])),
    });
    expect(useChokStore.getState().download).toEqual({ status: 'idle' });
    expect(dones).toEqual(Array.from({ length: 54 }, (_, index) => index + 1));
    expect(lastBytes).toBe(v1.manifest.bytes);
  });

  it('keeps nothing when a file always fails its hash', async () => {
    jest.useFakeTimers();
    const bad = v1.manifest.files.Bo.path;
    route = (url, hit) => (url === CHOK_BASE_URL + bad ? reply('tampered') : serve(v1)(url, hit));
    await expect(settle(installChok(v1.manifest))).resolves.toBe(false);
    expect(failedReason()).toBe('integrity');
    expect(useChokStore.getState().installed).toBeNull();
    expect(has('file:///doc/chok/v1')).toBe(false);
    expect(hitsOf(bad)).toHaveLength(3);
  });

  it('retries a file whose first body fails its hash', async () => {
    jest.useFakeTimers();
    const flaky = v1.manifest.files.Bo.path;
    route = (url, hit) => (url === CHOK_BASE_URL + flaky && hit === 1 ? reply('tampered') : serve(v1)(url, hit));
    await expect(settle(installChok(v1.manifest))).resolves.toBe(true);
    expect(hitsOf(flaky)).toHaveLength(2);
  });

  it('retries a file after an HTTP 503', async () => {
    jest.useFakeTimers();
    const flaky = v1.manifest.files.Bo.path;
    route = (url, hit) => (url === CHOK_BASE_URL + flaky && hit === 1 ? reply('', 503) : serve(v1)(url, hit));
    await expect(settle(installChok(v1.manifest))).resolves.toBe(true);
    expect(hitsOf(flaky)).toHaveLength(2);
  });

  it('leaves the installed version untouched when an update goes offline', async () => {
    await installChok(v1.manifest);
    jest.useFakeTimers();
    const lost = v2.manifest.files.Bo.path;
    route = (url, hit) => (url === CHOK_BASE_URL + lost ? Promise.reject(new Error('network')) : serve(v2)(url, hit));
    await expect(settle(installChok(v2.manifest))).resolves.toBe(false);
    expect(failedReason()).toBe('offline');
    expect(useChokStore.getState().installed?.version).toBe(1);
    for (const file of Object.values(v1.manifest.files)) expect(has(`file:///doc/chok/v1/${file.path}`)).toBe(true);
    expect(has('file:///doc/chok/v2')).toBe(false);
  });

  it('fails with space when the disk is too small, before any file is fetched', async () => {
    mockState.space = v1.manifest.bytes;
    await expect(installChok(v1.manifest)).resolves.toBe(false);
    expect(failedReason()).toBe('space');
    expect(fileUrls()).toEqual([]);
  });

  it('fails with storage when a write fails, and removes its directory', async () => {
    mockState.failWrite = true;
    await expect(installChok(v1.manifest)).resolves.toBe(false);
    expect(failedReason()).toBe('storage');
    expect(useChokStore.getState().installed).toBeNull();
    expect(has('file:///doc/chok/v1')).toBe(false);
  });

  it('fails with storage when the directory cannot be created', async () => {
    mockState.failCreate = true;
    await expect(installChok(v1.manifest)).resolves.toBe(false);
    expect(failedReason()).toBe('storage');
    expect(fileUrls()).toEqual([]);
  });

  it('downloads again over a damaged install of the same version and keeps the mitzvah as it was', async () => {
    await installChok(v1.manifest);
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    mockState.fs.delete(`file:///doc/chok/v1/${v1.manifest.files.Bo.path}`);
    await expect(installChok(v1.manifest)).resolves.toBe(true);
    expect(useChokStore.getState().installed?.version).toBe(1);
    expect(verifyChokInstall()).toBe(true);
    expect(useMitzvotStore.getState().activeMitzvot.chok_leyisrael.enabled).toBe(true);
  });

  it('lets a cancel after the last file win over the switch', async () => {
    const last = v1.manifest.files[CHOK_PARASHIYOT[CHOK_PARASHIYOT.length - 1]].path;
    route = (url, hit) =>
      url === CHOK_BASE_URL + last
        ? {
            ok: true,
            status: 200,
            text: async () => {
              cancelChokDownload();
              return v1.bodies[last];
            },
          }
        : serve(v1)(url, hit);
    await expect(installChok(v1.manifest)).resolves.toBe(false);
    expect(useChokStore.getState().installed).toBeNull();
    expect(useChokStore.getState().download).toEqual({ status: 'idle' });
    expect(has('file:///doc/chok/v1')).toBe(false);
  });

  it('never renames a directory, in a first install or an update', async () => {
    await expect(installChok(v1.manifest)).resolves.toBe(true);
    await expect(installChok(v2.manifest)).resolves.toBe(true);
  });

  it('stops quietly on cancel and removes its directory', async () => {
    const unsubscribe = useChokStore.subscribe((state, prev) => {
      if (state.download !== prev.download && state.download.status === 'downloading' && state.download.done === 1) {
        cancelChokDownload();
      }
    });
    await expect(installChok(v1.manifest)).resolves.toBe(false);
    unsubscribe();
    expect(useChokStore.getState().download).toEqual({ status: 'idle' });
    expect(useChokStore.getState().installed).toBeNull();
    expect(fileUrls()).toHaveLength(1);
    expect(has('file:///doc/chok/v1')).toBe(false);
  });

  it('runs once for two concurrent calls', async () => {
    const first = installChok(v1.manifest);
    const second = installChok(v1.manifest);
    expect(second).toBe(first);
    await first;
    for (const file of Object.values(v1.manifest.files)) expect(hitsOf(file.path)).toHaveLength(1);
  });

  it('replaces an older version and deletes it', async () => {
    await installChok(v1.manifest);
    await expect(installChok(v2.manifest)).resolves.toBe(true);
    expect(useChokStore.getState().installed?.version).toBe(2);
    expect(has('file:///doc/chok/v2')).toBe(true);
    expect(has('file:///doc/chok/v1')).toBe(false);
  });
});

describe('deleteChok', () => {
  it('removes the files and the install and switches the mitzvah off', async () => {
    await installChok(v1.manifest);
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    deleteChok();
    expect(useChokStore.getState().installed).toBeNull();
    expect(has('file:///doc/chok')).toBe(false);
    expect(useMitzvotStore.getState().activeMitzvot.chok_leyisrael.enabled).toBe(false);
  });
});

describe('checkChokUpdate', () => {
  const NOW = 1_800_000_000_000;

  it('does nothing while nothing is installed', async () => {
    await checkChokUpdate(NOW);
    expect(hits).toEqual([]);
  });

  it('does nothing within a day of the last check', async () => {
    await installChok(v1.manifest);
    hits = [];
    useChokStore.setState({ checkedAt: NOW - 1000 });
    await checkChokUpdate(NOW);
    expect(hits).toEqual([]);
  });

  it('records a newer version once the day has passed', async () => {
    await installChok(v1.manifest);
    useChokStore.setState({ checkedAt: NOW - CHOK_CHECK_INTERVAL_MS - 1 });
    route = serve(v2);
    await checkChokUpdate(NOW);
    expect(useChokStore.getState().latestVersion).toBe(2);
    expect(useChokStore.getState().checkedAt).toBe(NOW);
    expect(selectChokUpdateAvailable(useChokStore.getState())).toBe(true);
  });

  it('swallows a failure, stamps the attempt and asks again only after a day', async () => {
    await installChok(v1.manifest);
    useChokStore.setState({ checkedAt: NOW - CHOK_CHECK_INTERVAL_MS - 1 });
    route = () => Promise.reject(new Error('network'));
    await expect(checkChokUpdate(NOW)).resolves.toBeUndefined();
    expect(useChokStore.getState().checkedAt).toBe(NOW);
    expect(useChokStore.getState().latestVersion).toBe(1);
    hits = [];
    await checkChokUpdate(NOW + 1000);
    expect(hits).toEqual([]);
  });
});

describe('verifyChokInstall', () => {
  it('keeps an install whose files are all there', async () => {
    await installChok(v1.manifest);
    expect(verifyChokInstall()).toBe(true);
    expect(useChokStore.getState().installed).not.toBeNull();
  });

  it('drops an install with a missing file and switches the mitzvah off', async () => {
    await installChok(v1.manifest);
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    mockState.fs.delete(`file:///doc/chok/v1/${v1.manifest.files.Bo.path}`);
    expect(verifyChokInstall()).toBe(false);
    expect(useChokStore.getState().installed).toBeNull();
    expect(useMitzvotStore.getState().activeMitzvot.chok_leyisrael.enabled).toBe(false);
  });

  it('reports false when nothing is installed', () => {
    expect(verifyChokInstall()).toBe(false);
  });
});

describe('reconcileChokInstall', () => {
  const enabled = () => useMitzvotStore.getState().activeMitzvot.chok_leyisrael.enabled;

  it('forgets an install whose files are gone and switches the mitzvah off', async () => {
    await installChok(v1.manifest);
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    mockState.fs.delete(`file:///doc/chok/v1/${v1.manifest.files.Bo.path}`);
    reconcileChokInstall();
    expect(useChokStore.getState().installed).toBeNull();
    expect(enabled()).toBe(false);
  });

  it('switches the mitzvah off while nothing is installed', () => {
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    reconcileChokInstall();
    expect(enabled()).toBe(false);
  });

  it('deletes every leftover of chok and keeps the installed version', async () => {
    await installChok(v1.manifest);
    await installChok(v2.manifest);
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    mockState.fs.set('file:///doc/chok/staging', { dir: true });
    mockState.fs.set('file:///doc/chok/staging/x.json', { dir: false, text: 'x' });
    mockState.fs.set('file:///doc/chok/v1', { dir: true });
    mockState.fs.set('file:///doc/chok/v1/y.json', { dir: false, text: 'y' });
    reconcileChokInstall();
    expect(has('file:///doc/chok/staging')).toBe(false);
    expect(has('file:///doc/chok/v1')).toBe(false);
    expect(has('file:///doc/chok/v1/y.json')).toBe(false);
    expect(has('file:///doc/chok/v2')).toBe(true);
    expect(useChokStore.getState().installed?.version).toBe(2);
    expect(enabled()).toBe(true);
  });

  it('changes nothing while a download is in flight', async () => {
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    mockState.fs.set('file:///doc/chok/old', { dir: true });
    const running = installChok(v1.manifest);
    reconcileChokInstall();
    expect(enabled()).toBe(true);
    expect(has('file:///doc/chok/old')).toBe(true);
    expect(has('file:///doc/chok/v1')).toBe(true);
    await running;
  });

  it('does nothing on the web', () => {
    const replaced = jest.replaceProperty(Platform, 'OS', 'web');
    useMitzvotStore.getState().setEnabled('chok_leyisrael', true);
    expect(() => reconcileChokInstall()).not.toThrow();
    expect(enabled()).toBe(true);
    replaced.restore();
  });
});

describe('on the web', () => {
  it('supports no download', async () => {
    const replaced = jest.replaceProperty(Platform, 'OS', 'web');
    expect(chokDownloadSupported()).toBe(false);
    await expect(prepareChokDownload()).resolves.toBeNull();
    await expect(installChok(v1.manifest)).resolves.toBe(false);
    expect(hits).toEqual([]);
    replaced.restore();
  });
});

describe('the published add-on', () => {
  const DOCS = path.join(process.cwd(), 'docs', 'chok');
  const published = JSON.parse(fs.readFileSync(path.join(DOCS, 'manifest.json'), 'utf8')) as ChokManifest;

  it('has the size estimate the app shows', () => {
    expect(CHOK_SIZE_ESTIMATE_MB).toBe(Math.ceil(published.bytes / 1_000_000));
  });

  it('asks for the size plus the free-space margin', () => {
    expect(CHOK_SPACE_NEEDED_MB).toBe(69);
  });

  it('parses as a manifest of the app', () => {
    expect(parseChokManifest(published)).toEqual(published);
  });

  it('hashes the same in node and in the app', async () => {
    const [first] = Object.values(published.files);
    const raw = fs.readFileSync(path.join(DOCS, first.path));
    expect(createHash('sha256').update(raw).digest('hex')).toBe(first.sha256);
    expect(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw.toString('utf8'))).toBe(
      first.sha256,
    );
  });
});
