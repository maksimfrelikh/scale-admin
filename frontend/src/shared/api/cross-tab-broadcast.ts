export const authSessionEventName = 'scale-admin:auth-session-event';
export const storeListChangedEventName = 'scale-admin:store-list-changed-event';

export type AuthSessionEvent = {
  id: string;
  type: 'session-cleared' | 'session-changed';
  at: number;
};

export type StoreListChangedEvent = {
  id: string;
  type: 'store-list-changed';
  at: number;
  storeId?: string;
};

let authSessionBroadcastChannel: BroadcastChannel | null = null;
let storeListChangedBroadcastChannel: BroadcastChannel | null = null;

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getAuthSessionBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  authSessionBroadcastChannel ??= new BroadcastChannel(authSessionEventName);
  return authSessionBroadcastChannel;
}

function getStoreListChangedBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  storeListChangedBroadcastChannel ??= new BroadcastChannel(storeListChangedEventName);
  return storeListChangedBroadcastChannel;
}

function createEventId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function createAuthSessionEvent(type: AuthSessionEvent['type']): AuthSessionEvent {
  return { id: createEventId(), type, at: Date.now() };
}

function createStoreListChangedEvent(storeId?: string): StoreListChangedEvent {
  return { id: createEventId(), type: 'store-list-changed', at: Date.now(), storeId };
}

function readAuthSessionEvent(rawValue: string | null): AuthSessionEvent | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthSessionEvent>;
    if (
      typeof parsed.id === 'string'
      && typeof parsed.at === 'number'
      && (parsed.type === 'session-cleared' || parsed.type === 'session-changed')
    ) {
      return parsed as AuthSessionEvent;
    }
  } catch {
    // Ignore malformed cross-tab events from stale browser state.
  }

  return null;
}

function readStoreListChangedEvent(rawValue: string | null): StoreListChangedEvent | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoreListChangedEvent>;
    if (
      typeof parsed.id === 'string'
      && typeof parsed.at === 'number'
      && parsed.type === 'store-list-changed'
      && (typeof parsed.storeId === 'undefined' || typeof parsed.storeId === 'string')
    ) {
      return parsed as StoreListChangedEvent;
    }
  } catch {
    // Ignore malformed cross-tab events from stale browser state.
  }

  return null;
}

export function publishAuthSessionEvent(type: AuthSessionEvent['type']) {
  const event = createAuthSessionEvent(type);

  getAuthSessionBroadcastChannel()?.postMessage(event);

  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(authSessionEventName, JSON.stringify(event));
    window.localStorage.removeItem(authSessionEventName);
  } catch {
    // Storage can be unavailable in private browsing; BroadcastChannel already covered modern browsers.
  }
}

export function subscribeAuthSessionEvents(listener: (event: AuthSessionEvent) => void) {
  const seenEventIds = new Set<string>();

  function handleEvent(event: AuthSessionEvent | null) {
    if (!event || seenEventIds.has(event.id)) {
      return;
    }

    seenEventIds.add(event.id);
    listener(event);
  }

  const channel = getAuthSessionBroadcastChannel();
  const handleChannelMessage = (event: MessageEvent<AuthSessionEvent>) => handleEvent(event.data);
  channel?.addEventListener('message', handleChannelMessage);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === authSessionEventName) {
      handleEvent(readAuthSessionEvent(event.newValue));
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleChannelMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

export function publishStoreListChangedEvent(storeId?: string) {
  const event = createStoreListChangedEvent(storeId);

  getStoreListChangedBroadcastChannel()?.postMessage(event);

  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(storeListChangedEventName, JSON.stringify(event));
    window.localStorage.removeItem(storeListChangedEventName);
  } catch {
    // Storage can be unavailable in private browsing; BroadcastChannel already covered modern browsers.
  }
}

export function subscribeStoreListChangedEvents(listener: (event: StoreListChangedEvent) => void) {
  const seenEventIds = new Set<string>();

  function handleEvent(event: StoreListChangedEvent | null) {
    if (!event || seenEventIds.has(event.id)) {
      return;
    }

    seenEventIds.add(event.id);
    listener(event);
  }

  const channel = getStoreListChangedBroadcastChannel();
  const handleChannelMessage = (event: MessageEvent<StoreListChangedEvent>) => handleEvent(event.data);
  channel?.addEventListener('message', handleChannelMessage);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === storeListChangedEventName) {
      handleEvent(readStoreListChangedEvent(event.newValue));
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleChannelMessage);
    window.removeEventListener('storage', handleStorage);
  };
}
