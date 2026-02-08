import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const baseDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDataPath = path.resolve(baseDir, "..", "..", "db", "data.json");
const dataPath = process.env.DATA_PATH || defaultDataPath;
let storePromise = null;
let writeQueue = Promise.resolve();
function emptyStore() {
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
function maxId(items) {
    return items.reduce((max, item) => Math.max(max, item.id), 0);
}
function normalizeStore(raw) {
    const base = emptyStore();
    const store = {
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
    store.seasons = store.seasons.map((season) => ({
        ...season,
        topScoresCount: typeof season.topScoresCount === "number" && season.topScoresCount >= 1
            ? season.topScoresCount
            : 7
    }));
    store.meta.lastIds.players = Math.max(store.meta.lastIds.players, maxId(store.players));
    store.meta.lastIds.seasons = Math.max(store.meta.lastIds.seasons, maxId(store.seasons));
    store.meta.lastIds.events = Math.max(store.meta.lastIds.events, maxId(store.events));
    store.meta.lastIds.eventParticipants = Math.max(store.meta.lastIds.eventParticipants, maxId(store.eventParticipants));
    store.meta.lastIds.auditLog = Math.max(store.meta.lastIds.auditLog, maxId(store.auditLog));
    return store;
}
async function persistStore(store) {
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(store, null, 2), "utf8");
}
async function loadStore() {
    try {
        const raw = await fs.readFile(dataPath, "utf8");
        return normalizeStore(JSON.parse(raw));
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            const store = emptyStore();
            await persistStore(store);
            return store;
        }
        throw error;
    }
}
export async function readStore() {
    if (!storePromise) {
        storePromise = loadStore();
    }
    return storePromise;
}
export function nextId(store, key) {
    store.meta.lastIds[key] += 1;
    return store.meta.lastIds[key];
}
export async function writeStore(mutator) {
    const operation = writeQueue.then(async () => {
        const store = await readStore();
        const result = await mutator(store);
        await persistStore(store);
        return result;
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
}
export function getDataPath() {
    return dataPath;
}
