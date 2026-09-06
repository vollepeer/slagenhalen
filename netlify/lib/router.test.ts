import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { handleApiRequest } from "./router";
import { resetDatabase } from "./testHelpers";

const ctx = { userId: "00000000-0000-0000-0000-000000000000", userEmail: "test@example.com" };

beforeEach(async () => {
  await resetDatabase();
});

describe("players endpoints", () => {
  it("creates a player via POST /api/players", async () => {
    const result = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    expect(result.status).toBe(201);
  });

  it("rejects a duplicate player name", async () => {
    await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    const result = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "jan" }, ctx);
    expect(result.status).toBe(400);
  });

  it("returns 404 for an unknown route", async () => {
    const result = await handleApiRequest("GET", "/api/nope", new URLSearchParams(), undefined, ctx);
    expect(result.status).toBe(404);
  });
});

describe("seasons endpoints", () => {
  it("defaults topScoresCount to 7", async () => {
    await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const list = await handleApiRequest(
      "GET",
      "/api/seasons",
      new URLSearchParams([["includeArchived", "false"]]),
      undefined,
      ctx
    );
    expect((list.body as any[])[0].topScoresCount).toBe(7);
  });
});

describe("events endpoints", () => {
  it("blocks locking until every participant has all three scores", async () => {
    const season = await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const seasonId = (season.body as { id: number }).id;
    const event = await handleApiRequest(
      "POST",
      "/api/events",
      new URLSearchParams(),
      { seasonId, eventDate: "2026-07-02" },
      ctx
    );
    const eventId = (event.body as { id: number }).id;
    const player = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    const playerId = (player.body as { id: number }).id;
    await handleApiRequest("POST", `/api/events/${eventId}/participants`, new URLSearchParams(), { playerId }, ctx);

    const lockAttempt = await handleApiRequest("POST", `/api/events/${eventId}/lock`, new URLSearchParams(), undefined, ctx);
    expect(lockAttempt.status).toBe(400);
  });

  it("locks successfully once all scores are known, then rejects further edits", async () => {
    const season = await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const seasonId = (season.body as { id: number }).id;
    const event = await handleApiRequest(
      "POST",
      "/api/events",
      new URLSearchParams(),
      { seasonId, eventDate: "2026-07-02" },
      ctx
    );
    const eventId = (event.body as { id: number }).id;
    const player = await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    const playerId = (player.body as { id: number }).id;
    const participant = await handleApiRequest(
      "POST",
      `/api/events/${eventId}/participants`,
      new URLSearchParams(),
      { playerId },
      ctx
    );
    const participantId = (participant.body as { id: number }).id;

    await handleApiRequest(
      "PATCH",
      `/api/events/${eventId}/participants/${participantId}`,
      new URLSearchParams(),
      { pointsR1: 10, pointsR2: 10, pointsR3: 10 },
      ctx
    );

    const lockResult = await handleApiRequest("POST", `/api/events/${eventId}/lock`, new URLSearchParams(), undefined, ctx);
    expect(lockResult.status).toBe(200);

    const editAttempt = await handleApiRequest(
      "PATCH",
      `/api/events/${eventId}/participants/${participantId}`,
      new URLSearchParams(),
      { pointsR1: 5 },
      ctx
    );
    expect(editAttempt.status).toBe(400);
  });
});

describe("season ranking endpoint", () => {
  it("is unavailable while a due event is still open", async () => {
    const season = await handleApiRequest("POST", "/api/seasons", new URLSearchParams(), { name: "2026" }, ctx);
    const seasonId = (season.body as { id: number }).id;
    await handleApiRequest("POST", "/api/events", new URLSearchParams(), { seasonId, eventDate: "2020-01-01" }, ctx);

    const ranking = await handleApiRequest("GET", `/api/seasons/${seasonId}/ranking`, new URLSearchParams(), undefined, ctx);
    expect((ranking.body as { available: boolean }).available).toBe(false);
  });
});

describe("data management endpoints", () => {
  it("exports all data via GET /api/data/export", async () => {
    await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);

    const result = await handleApiRequest("GET", "/api/data/export", new URLSearchParams(), undefined, ctx);
    expect(result.status).toBe(200);
    expect((result.body as { players: unknown[] }).players).toHaveLength(1);
  });

  it("wipes all data via POST /api/data/wipe", async () => {
    await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);

    const wipeResult = await handleApiRequest("POST", "/api/data/wipe", new URLSearchParams(), undefined, ctx);
    expect(wipeResult.status).toBe(200);

    const players = await handleApiRequest("GET", "/api/players", new URLSearchParams(), undefined, ctx);
    expect(players.body).toEqual([]);
  });

  it("rejects a malformed import payload with 400", async () => {
    const result = await handleApiRequest("POST", "/api/data/import", new URLSearchParams(), { players: [] }, ctx);
    expect(result.status).toBe(400);
  });

  it("imports a valid snapshot via POST /api/data/import", async () => {
    await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Jan" }, ctx);
    const exported = await handleApiRequest("GET", "/api/data/export", new URLSearchParams(), undefined, ctx);

    await handleApiRequest("POST", "/api/data/wipe", new URLSearchParams(), undefined, ctx);

    const importResult = await handleApiRequest("POST", "/api/data/import", new URLSearchParams(), exported.body, ctx);
    expect(importResult.status).toBe(200);

    const players = await handleApiRequest("GET", "/api/players", new URLSearchParams(), undefined, ctx);
    expect(players.body as unknown[]).toHaveLength(1);
    expect((players.body as { name: string }[])[0].name).toBe("Jan");
  });

  it("imports a legacy offline-app export (camelCase, meta.lastIds wrapper), converting it end-to-end", async () => {
    const legacyBackup = {
      meta: { lastIds: { players: 1, seasons: 1, events: 1, eventParticipants: 1, auditLog: 0 } },
      players: [
        { id: 1, name: "Piet", isArchived: false, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" }
      ],
      seasons: [
        {
          id: 1,
          name: "2020",
          topScoresCount: 7,
          startDate: null,
          endDate: null,
          isArchived: false,
          createdAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z"
        }
      ],
      events: [
        {
          id: 1,
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
      ],
      eventParticipants: [
        {
          id: 1,
          eventId: 1,
          playerId: 1,
          pointsR1: 10,
          pointsR2: 8,
          pointsR3: 12,
          createdAt: "2020-03-01T20:05:00.000Z",
          updatedAt: "2020-03-01T21:00:00.000Z"
        }
      ],
      auditLog: [
        { id: 1, entityType: "event", entityId: 1, action: "LOCKED", oldValueJson: null, newValueJson: null, createdAt: "2020-03-01T22:00:00.000Z" }
      ]
    };

    const importResult = await handleApiRequest("POST", "/api/data/import", new URLSearchParams(), legacyBackup, ctx);
    expect(importResult.status).toBe(200);

    const players = await handleApiRequest("GET", "/api/players", new URLSearchParams(), undefined, ctx);
    expect((players.body as { name: string }[])[0].name).toBe("Piet");

    const eventDetail = await handleApiRequest("GET", "/api/events/1", new URLSearchParams(), undefined, ctx);
    expect(eventDetail.status).toBe(200);
    const event = eventDetail.body as { status: string; participants: Array<{ playerName: string; pointsR1: number; totalPoints: number }> };
    expect(event.status).toBe("LOCKED");
    expect(event.participants).toHaveLength(1);
    expect(event.participants[0].playerName).toBe("Piet");
    expect(event.participants[0].pointsR1).toBe(10);
    expect(event.participants[0].totalPoints).toBe(30);

    // Legacy audit entries aren't migrated — the only entry present is the router's own
    // "IMPORTED" log line for this import action (attributed to the real authenticated user),
    // not the legacy file's "LOCKED" entry (which had no user attribution to carry over).
    const exportAfter = await handleApiRequest("GET", "/api/data/export", new URLSearchParams(), undefined, ctx);
    const auditLog = (exportAfter.body as { auditLog: Array<{ action: string; entity_type: string }> }).auditLog;
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].action).toBe("IMPORTED");
    expect(auditLog[0].entity_type).toBe("data");
  });

  it("rejects a corrupted legacy-shaped import (missing array) with 400 and does not wipe existing data", async () => {
    await handleApiRequest("POST", "/api/players", new URLSearchParams(), { name: "Blijft staan" }, ctx);

    const corruptedLegacyBackup = {
      meta: { lastIds: { players: 0, seasons: 0, events: 0, eventParticipants: 0, auditLog: 0 } },
      // "players" is missing entirely — a real export from the old app never omits it.
      seasons: [],
      events: [],
      eventParticipants: [],
      auditLog: []
    };

    const importResult = await handleApiRequest(
      "POST",
      "/api/data/import",
      new URLSearchParams(),
      corruptedLegacyBackup,
      ctx
    );
    expect(importResult.status).toBe(400);

    const players = await handleApiRequest("GET", "/api/players", new URLSearchParams(), undefined, ctx);
    expect((players.body as { name: string }[])[0].name).toBe("Blijft staan");
  });
});
