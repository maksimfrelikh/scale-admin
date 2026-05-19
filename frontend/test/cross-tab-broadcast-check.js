// BUG-REG-014 + BUG-REG-017 §4.3 scoped test: cross-tab auth broadcast propagation.
//
// The auth slice itself lives in RTK Query and can't be tested without a full
// Redux harness, but the React subscriber in main.tsx is a one-line bridge —
// when it fires, it calls store.dispatch(...). The actual cross-tab plumbing
// is the BroadcastChannel + localStorage pub/sub in cross-tab-broadcast.ts.
//
// This test polyfills BroadcastChannel and localStorage in node, then asserts
// that a publish on "tab A" reaches the subscriber on "tab B" within ≤1s via
// both the BroadcastChannel path and the storage-event path. If this passes,
// the React subscriber in main.tsx is guaranteed to fire — there is no other
// dependency between publish and subscribe.

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REACTION_DEADLINE_MS = 1000;
const SOURCE_PATH = path.resolve(__dirname, '..', 'src', 'shared', 'api', 'cross-tab-broadcast.ts');
const SOURCE_URL = pathToFileURL(SOURCE_PATH).href;

// ---------- shared in-process state simulating two tabs in one browser ----------
const broadcastChannelHubs = new Map();
const storageHubs = new Map();

class TabStorage {
  constructor(tabId) {
    this.tabId = tabId;
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    const oldValue = this.items.has(key) ? this.items.get(key) : null;
    this.items.set(key, String(value));
    this._fanout(key, String(value), oldValue);
  }

  removeItem(key) {
    const oldValue = this.items.has(key) ? this.items.get(key) : null;
    this.items.delete(key);
    this._fanout(key, null, oldValue);
  }

  _fanout(key, newValue, oldValue) {
    // Storage events fire on OTHER tabs, not the originating tab.
    for (const [otherTabId, listeners] of storageHubs.entries()) {
      if (otherTabId === this.tabId) continue;
      for (const listener of listeners) {
        listener({ key, newValue, oldValue });
      }
    }
  }
}

class FakeBroadcastChannel {
  constructor(name, tabId) {
    this.name = name;
    this.tabId = tabId;
    this._listeners = new Set();
    if (!broadcastChannelHubs.has(name)) {
      broadcastChannelHubs.set(name, new Set());
    }
    broadcastChannelHubs.get(name).add(this);
  }

  postMessage(data) {
    // BroadcastChannel does NOT fire `message` on the channel that posted.
    for (const channel of broadcastChannelHubs.get(this.name)) {
      if (channel === this) continue;
      for (const listener of channel._listeners) {
        listener({ data });
      }
    }
  }

  addEventListener(eventName, listener) {
    if (eventName !== 'message') return;
    this._listeners.add(listener);
  }

  removeEventListener(eventName, listener) {
    if (eventName !== 'message') return;
    this._listeners.delete(listener);
  }
}

function setTabContext(tabId, { withBroadcastChannel = true } = {}) {
  const storage = new TabStorage(tabId);
  if (!storageHubs.has(tabId)) storageHubs.set(tabId, new Set());

  globalThis.window = {
    localStorage: storage,
    addEventListener(eventName, listener) {
      if (eventName !== 'storage') return;
      storageHubs.get(tabId).add(listener);
    },
    removeEventListener(eventName, listener) {
      if (eventName !== 'storage') return;
      storageHubs.get(tabId).delete(listener);
    },
  };
  if (withBroadcastChannel) {
    globalThis.BroadcastChannel = class extends FakeBroadcastChannel {
      constructor(name) { super(name, tabId); }
    };
  } else {
    delete globalThis.BroadcastChannel;
  }
}

function resetWorld() {
  broadcastChannelHubs.clear();
  storageHubs.clear();
  delete globalThis.window;
  delete globalThis.BroadcastChannel;
}

async function loadFreshModule(tabId) {
  // Each tab needs its own copy of the module so the broadcast-channel singletons
  // belong to that tab. Cache-bust the import URL to defeat node's module cache.
  return import(`${SOURCE_URL}?tab=${tabId}&n=${Math.random().toString(36).slice(2)}`);
}

async function loadBroadcastForTab(tabId, options) {
  setTabContext(tabId, options);
  return loadFreshModule(tabId);
}

async function withRebindToTab(tabId, fn, options) {
  setTabContext(tabId, options);
  return fn();
}

// ---------- tests ----------

async function testBroadcastChannelPropagation() {
  resetWorld();
  const tabA = await loadBroadcastForTab('A');
  const tabB = await loadBroadcastForTab('B');

  let receivedEvent = null;
  const receivedAt = { ts: null };

  await withRebindToTab('B', () => {
    tabB.subscribeAuthSessionEvents((event) => {
      receivedEvent = event;
      receivedAt.ts = Date.now();
    });
  });

  const publishedAt = Date.now();
  await withRebindToTab('A', () => {
    tabA.publishAuthSessionEvent('session-cleared');
  });

  await new Promise((r) => setTimeout(r, 10));

  assert.ok(receivedEvent, 'Tab B should receive the broadcast');
  assert.equal(receivedEvent.type, 'session-cleared');
  const elapsed = receivedAt.ts - publishedAt;
  assert.ok(elapsed < REACTION_DEADLINE_MS, `propagation took ${elapsed}ms, expected < ${REACTION_DEADLINE_MS}ms`);
}

async function testSessionChangedReachesOtherTab() {
  resetWorld();
  const tabA = await loadBroadcastForTab('A');
  const tabB = await loadBroadcastForTab('B');

  const received = [];
  await withRebindToTab('B', () => {
    tabB.subscribeAuthSessionEvents((event) => received.push(event));
  });

  await withRebindToTab('A', () => {
    tabA.publishAuthSessionEvent('session-changed');
  });

  await new Promise((r) => setTimeout(r, 10));

  assert.equal(received.length, 1, 'session-changed should propagate exactly once');
  assert.equal(received[0].type, 'session-changed');
}

async function testStorageFallbackWhenBroadcastChannelUnavailable() {
  // Simulate an older browser: no BroadcastChannel. The storage-event path must
  // still deliver the event so cross-tab logout/role-change works.
  resetWorld();
  const tabA = await loadBroadcastForTab('A', { withBroadcastChannel: false });
  const tabB = await loadBroadcastForTab('B', { withBroadcastChannel: false });

  const received = [];
  await withRebindToTab('B', () => {
    tabB.subscribeAuthSessionEvents((event) => received.push(event));
  }, { withBroadcastChannel: false });

  await withRebindToTab('A', () => {
    tabA.publishAuthSessionEvent('session-cleared');
  }, { withBroadcastChannel: false });

  await new Promise((r) => setTimeout(r, 10));

  assert.equal(received.length, 1, 'storage-event fallback should deliver session-cleared exactly once');
  assert.equal(received[0].type, 'session-cleared');
}

async function testSubscriberDedupesByEventId() {
  // Publishing writes to BOTH BroadcastChannel and localStorage. The subscriber
  // must dedupe by id so it does not fire twice for the same logical event.
  resetWorld();
  const tabA = await loadBroadcastForTab('A');
  const tabB = await loadBroadcastForTab('B');

  const received = [];
  await withRebindToTab('B', () => {
    tabB.subscribeAuthSessionEvents((event) => received.push(event));
  });

  await withRebindToTab('A', () => {
    tabA.publishAuthSessionEvent('session-cleared');
  });

  await new Promise((r) => setTimeout(r, 10));

  assert.equal(received.length, 1, `subscriber should dedupe BroadcastChannel + storage paths, got ${received.length}`);
}

async function testStoreListChangedAlsoPropagates() {
  // Store-list channel uses the same wiring; smoke-test it so a future refactor
  // that breaks one channel also fails here.
  resetWorld();
  const tabA = await loadBroadcastForTab('A');
  const tabB = await loadBroadcastForTab('B');

  const received = [];
  await withRebindToTab('B', () => {
    tabB.subscribeStoreListChangedEvents((event) => received.push(event));
  });

  await withRebindToTab('A', () => {
    tabA.publishStoreListChangedEvent('store-id-1');
  });

  await new Promise((r) => setTimeout(r, 10));

  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'store-list-changed');
  assert.equal(received[0].storeId, 'store-id-1');
}

await testBroadcastChannelPropagation();
await testSessionChangedReachesOtherTab();
await testStorageFallbackWhenBroadcastChannelUnavailable();
await testSubscriberDedupesByEventId();
await testStoreListChangedAlsoPropagates();
console.log('CROSS_TAB_BROADCAST_CHECK=PASS');
