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
