import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { insertPlayer } from "./players";
import type { BackupSnapshot } from "./backup";
import { buildSnapshot } from "./backup";
import { exportAllData, importSnapshot, wipeAllData } from "./dataManagement";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("exportAllData", () => {
  it("returns a snapshot matching buildSnapshot's shape", async () => {
    await insertPlayer("Jan Jansen");
    const exported = await exportAllData();
    const direct = await buildSnapshot();
    expect(Object.keys(exported).sort()).toEqual(Object.keys(direct).sort());
    expect(exported.players).toHaveLength(1);
    expect(exported.seasons).toEqual([]);
    expect(typeof exported.createdAt).toBe("string");
  });
});

describe("wipeAllData", () => {
  it("empties all tables", async () => {
    await insertPlayer("Jan Jansen");
    await insertPlayer("Piet Pietersen");

    await wipeAllData();

    const snapshot = await buildSnapshot();
    expect(snapshot.players).toEqual([]);
    expect(snapshot.seasons).toEqual([]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.eventParticipants).toEqual([]);
    expect(snapshot.auditLog).toEqual([]);
  });
});

describe("importSnapshot", () => {
  it("wipes existing rows then restores the rows from the snapshot", async () => {
    await insertPlayer("Jan Jansen");
    const snapshot = await buildSnapshot();

    await insertPlayer("Extra Speler die niet in de snapshot zit");
    const beforeImport = await buildSnapshot();
    expect(beforeImport.players).toHaveLength(2);

    await importSnapshot(snapshot);

    const afterImport = await buildSnapshot();
    expect(afterImport.players).toHaveLength(1);
    expect((afterImport.players[0] as { name: string }).name).toBe("Jan Jansen");
  });

  it("resets identity sequences so a post-import insert doesn't collide with an imported id", async () => {
    const now = new Date().toISOString();
    const snapshot: BackupSnapshot = {
      createdAt: now,
      players: [{ id: 100000, name: "Geimporteerde Speler", is_archived: false, created_at: now, updated_at: now }],
      seasons: [],
      events: [],
      eventParticipants: [],
      auditLog: []
    };

    await importSnapshot(snapshot);

    const afterImport = await buildSnapshot();
    expect(afterImport.players).toHaveLength(1);
    expect((afterImport.players[0] as { id: number }).id).toBe(100000);

    const newPlayer = await insertPlayer("Nieuwe Speler");
    expect(newPlayer.id).toBeGreaterThan(100000);
  });
});
