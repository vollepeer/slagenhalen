import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

export type Player = {
  id: number;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Season = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Event = {
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

export type EventParticipant = {
  id: number;
  eventId: number;
  playerId: number;
  pointsR1: number | null;
  pointsR2: number | null;
  pointsR3: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
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
  players: Player[];
  seasons: Season[];
  events: Event[];
  eventParticipants: EventParticipant[];
  auditLog: AuditLog[];
};

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDataPath = path.resolve(baseDir, "..", "..", "db", "data.json");
const dataPath = process.env.DATA_PATH || defaultDataPath;

let storePromise: Promise<Store> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

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

async function persistStore(store: Store) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(store, null, 2), "utf8");
}

async function loadStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(dataPath, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      const store = emptyStore();
      await persistStore(store);
      return store;
    }
    throw error;
  }
}

export async function readStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = loadStore();
  }
  return storePromise;
}

export function nextId(store: Store, key: keyof Store["meta"]["lastIds"]) {
  store.meta.lastIds[key] += 1;
  return store.meta.lastIds[key];
}

export async function writeStore<T>(
  mutator: (store: Store) => T | Promise<T>
): Promise<T> {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await persistStore(store);
    return result;
  });

  writeQueue = operation.then(
    () => undefined,
    () => undefined
  );

  return operation;
}

export function getDataPath() {
  return dataPath;
}
