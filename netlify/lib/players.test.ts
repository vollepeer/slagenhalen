import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { findPlayerByName, insertPlayer, listPlayers, updatePlayerRow } from "./players";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("players repo", () => {
  it("creates and lists a player", async () => {
    await insertPlayer("Jan Jansen");
    const players = await listPlayers("", false);
    expect(players).toHaveLength(1);
    expect(players[0].name).toBe("Jan Jansen");
  });

  it("finds a duplicate name case-insensitively", async () => {
    await insertPlayer("Jan Jansen");
    expect(await findPlayerByName("jan jansen")).not.toBeNull();
  });

  it("excludes archived players by default", async () => {
    const player = await insertPlayer("Piet");
    await updatePlayerRow(player.id, { is_archived: true });
    expect(await listPlayers("", false)).toHaveLength(0);
    expect(await listPlayers("", true)).toHaveLength(1);
  });
});
