import { describe, expect, it } from "vitest";
import { convertLegacyOfflineBackup, isLegacyOfflineBackup } from "./legacyImportFormat";

const emptyLegacyStore = {
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

describe("isLegacyOfflineBackup", () => {
  it("recognizes a legacy offline export by its meta.lastIds wrapper", () => {
    expect(isLegacyOfflineBackup(emptyLegacyStore)).toBe(true);
  });

  it("does not misidentify a current-format snapshot (no meta key) as legacy", () => {
    expect(
      isLegacyOfflineBackup({
        createdAt: "2026-09-06T00:00:00.000Z",
        players: [],
        seasons: [],
        events: [],
        eventParticipants: [],
        auditLog: []
      })
    ).toBe(false);
  });

  it("rejects non-objects and null", () => {
    expect(isLegacyOfflineBackup(null)).toBe(false);
    expect(isLegacyOfflineBackup("not json")).toBe(false);
    expect(isLegacyOfflineBackup(42)).toBe(false);
  });

  it("rejects an object with a meta key but no lastIds", () => {
    expect(isLegacyOfflineBackup({ meta: {} })).toBe(false);
  });
});

describe("convertLegacyOfflineBackup", () => {
  it("converts a player row from camelCase to snake_case", () => {
    const legacy = {
      ...emptyLegacyStore,
      players: [
        { id: 1, name: "Jan Jansen", isArchived: false, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-02T00:00:00.000Z" }
      ]
    };
    const result = convertLegacyOfflineBackup(legacy);
    expect(result.players).toEqual([
      { id: 1, name: "Jan Jansen", is_archived: false, created_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-02T00:00:00.000Z" }
    ]);
  });

  it("converts a season row, including nullable startDate/endDate", () => {
    const legacy = {
      ...emptyLegacyStore,
      seasons: [
        { id: 1, name: "2020", topScoresCount: 7, startDate: null, endDate: null, isArchived: false, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" }
      ]
    };
    const result = convertLegacyOfflineBackup(legacy);
    expect(result.seasons).toEqual([
      { id: 1, name: "2020", top_scores_count: 7, start_date: null, end_date: null, is_archived: false, created_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-01T00:00:00.000Z" }
    ]);
  });

  it("converts an event row, including prize ranks and lockedAt", () => {
    const legacy = {
      ...emptyLegacyStore,
      events: [
        {
          id: 5,
          seasonId: 1,
          eventDate: "2020-03-01",
          title: null,
          notes: null,
          prizeRank1: 1,
          prizeRank2: 18,
          prizeRank3: 25,
          status: "LOCKED" as const,
          lockedAt: "2020-03-01T22:00:00.000Z",
          isArchived: false,
          createdAt: "2020-03-01T20:00:00.000Z",
          updatedAt: "2020-03-01T22:00:00.000Z"
        }
      ]
    };
    const result = convertLegacyOfflineBackup(legacy);
    expect(result.events).toEqual([
      {
        id: 5,
        season_id: 1,
        event_date: "2020-03-01",
        title: null,
        notes: null,
        prize_rank_1: 1,
        prize_rank_2: 18,
        prize_rank_3: 25,
        status: "LOCKED",
        locked_at: "2020-03-01T22:00:00.000Z",
        is_archived: false,
        created_at: "2020-03-01T20:00:00.000Z",
        updated_at: "2020-03-01T22:00:00.000Z"
      }
    ]);
  });

  it("converts an event-participant row, including null scores", () => {
    const legacy = {
      ...emptyLegacyStore,
      eventParticipants: [
        { id: 9, eventId: 5, playerId: 1, pointsR1: 10, pointsR2: null, pointsR3: null, createdAt: "2020-03-01T20:05:00.000Z", updatedAt: "2020-03-01T20:05:00.000Z" }
      ]
    };
    const result = convertLegacyOfflineBackup(legacy);
    expect(result.eventParticipants).toEqual([
      { id: 9, event_id: 5, player_id: 1, points_r1: 10, points_r2: null, points_r3: null, created_at: "2020-03-01T20:05:00.000Z", updated_at: "2020-03-01T20:05:00.000Z" }
    ]);
  });

  it("drops audit log entries — the old format has no user attribution and doesn't map to the new schema", () => {
    const legacy = {
      ...emptyLegacyStore,
      auditLog: [
        { id: 1, entityType: "event", entityId: 5, action: "LOCKED", oldValueJson: null, newValueJson: null, createdAt: "2020-03-01T22:00:00.000Z" }
      ]
    };
    const result = convertLegacyOfflineBackup(legacy);
    expect(result.auditLog).toEqual([]);
  });

  it("sets a fresh createdAt timestamp on the converted snapshot", () => {
    const result = convertLegacyOfflineBackup(emptyLegacyStore);
    expect(typeof result.createdAt).toBe("string");
    expect(() => new Date(result.createdAt).toISOString()).not.toThrow();
  });

  it("handles a legacy store missing optional arrays entirely (defensive)", () => {
    const result = convertLegacyOfflineBackup({ meta: { lastIds: {} } });
    expect(result.players).toEqual([]);
    expect(result.seasons).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.eventParticipants).toEqual([]);
    expect(result.auditLog).toEqual([]);
  });
});
