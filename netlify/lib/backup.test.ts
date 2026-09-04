import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { insertPlayer } from "./players";
import { buildSnapshot } from "./backup";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("buildSnapshot", () => {
  it("includes every table and a timestamp", async () => {
    await insertPlayer("Jan Jansen");
    const snapshot = await buildSnapshot();
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.seasons).toEqual([]);
    expect(typeof snapshot.createdAt).toBe("string");
  });
});
