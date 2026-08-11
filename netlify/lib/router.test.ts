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
