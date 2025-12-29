export type PlayerEntity = {
  id: number;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SeasonEntity = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EventEntity = {
  id: number;
  seasonId: number;
  eventDate: string;
  title: string | null;
  notes: string | null;
  prizeRank1: number;
  prizeRank2: number;
  prizeRank3: number;
  status: "OPEN" | "LOCKED";
  lockedAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EventParticipantEntity = {
  id: number;
  eventId: number;
  playerId: number;
  pointsR1: number | null;
  pointsR2: number | null;
  pointsR3: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntity = {
  id: number;
  entityType: string | null;
  entityId: number | null;
  action: string | null;
  oldValueJson: unknown | null;
  newValueJson: unknown | null;
  createdAt: string;
};

export type Store = {
  meta: {
    lastIds: {
      players: number;
      seasons: number;
      events: number;
      eventParticipants: number;
      auditLog: number;
    };
  };
  players: PlayerEntity[];
  seasons: SeasonEntity[];
  events: EventEntity[];
  eventParticipants: EventParticipantEntity[];
  auditLog: AuditLogEntity[];
};

const STORAGE_KEY = "filip-card-data";

function emptyStore(): Store {
  return {
    meta: {
      lastIds: {
        players: 0,
        seasons: 0,
        events: 0,
        eventParticipants: 0,
        auditLog: 0
      }
    },
    players: [],
    seasons: [],
    events: [],
    eventParticipants: [],
    auditLog: []
  };
}

function maxId(items: Array<{ id: number }>) {
  return items.reduce((max, item) => Math.max(max, item.id), 0);
}

function normalizeStore(raw: Partial<Store>): Store {
  const base = emptyStore();
  const store: Store = {
    ...base,
    ...raw,
    meta: {
      lastIds: {
        ...base.meta.lastIds,
        ...(raw.meta?.lastIds ?? {})
      }
    },
    players: raw.players ?? [],
    seasons: raw.seasons ?? [],
    events: raw.events ?? [],
    eventParticipants: raw.eventParticipants ?? [],
    auditLog: raw.auditLog ?? []
  };

  store.meta.lastIds.players = Math.max(store.meta.lastIds.players, maxId(store.players));
  store.meta.lastIds.seasons = Math.max(store.meta.lastIds.seasons, maxId(store.seasons));
  store.meta.lastIds.events = Math.max(store.meta.lastIds.events, maxId(store.events));
  store.meta.lastIds.eventParticipants = Math.max(
    store.meta.lastIds.eventParticipants,
    maxId(store.eventParticipants)
  );
  store.meta.lastIds.auditLog = Math.max(store.meta.lastIds.auditLog, maxId(store.auditLog));

  return store;
}

function saveStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function readStore(): Store {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const store = emptyStore();
    saveStore(store);
    return store;
  }
  try {
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    const store = emptyStore();
    saveStore(store);
    return store;
  }
}

export function writeStore<T>(mutator: (store: Store) => T): T {
  const store = readStore();
  const result = mutator(store);
  saveStore(store);
  return result;
}

export function nextId(store: Store, key: keyof Store["meta"]["lastIds"]) {
  store.meta.lastIds[key] += 1;
  return store.meta.lastIds[key];
}

export function resetStore() {
  const store = emptyStore();
  saveStore(store);
  return store;
}

export function exportStore() {
  return JSON.stringify(readStore(), null, 2);
}

export function importStore(raw: string) {
  const parsed = JSON.parse(raw) as Partial<Store>;
  const store = normalizeStore(parsed);
  saveStore(store);
  return store;
}
