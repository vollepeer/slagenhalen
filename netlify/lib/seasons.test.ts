import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { insertSeason, listSeasons } from "./seasons";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("seasons repo", () => {
  it("defaults topScoresCount to 7 when not provided elsewhere", async () => {
    const season = await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    expect(season.top_scores_count).toBe(7);
  });

  it("lists seasons newest-id-first", async () => {
    await insertSeason({ name: "2025", topScoresCount: 7, startDate: null, endDate: null });
    await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    const seasons = await listSeasons(false);
    expect(seasons[0].name).toBe("2026");
  });
});
