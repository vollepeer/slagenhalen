import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { insertSeason } from "./seasons";
import { insertPlayer } from "./players";
import {
  getParticipants,
  insertEvent,
  insertParticipant,
  listEvents,
  updateParticipantRow
} from "./events";
import { resetDatabase } from "./testHelpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("events repo", () => {
  it("creates an event and lists it under its season", async () => {
    const season = await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    const event = await insertEvent({
      seasonId: season.id,
      eventDate: "2026-07-02",
      title: null,
      notes: null,
      prizeRanks: [1, 18, 25]
    });
    const events = await listEvents(season.id, false);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(event.id);
  });

  it("joins player names when reading participants", async () => {
    const season = await insertSeason({ name: "2026", topScoresCount: 7, startDate: null, endDate: null });
    const event = await insertEvent({
      seasonId: season.id,
      eventDate: "2026-07-02",
      title: null,
      notes: null,
      prizeRanks: [1, 18, 25]
    });
    const player = await insertPlayer("Jan Jansen");
    const participant = await insertParticipant(event.id, player.id);
    await updateParticipantRow(participant.id, { points_r1: 10 });

    const participants = await getParticipants(event.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].player_name).toBe("Jan Jansen");
    expect(participants[0].points_r1).toBe(10);
  });
});
