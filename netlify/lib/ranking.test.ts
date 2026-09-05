import { describe, expect, it } from "vitest";
import { canLockEvent, computeRanking, type ParticipantRow } from "./ranking";

function row(overrides: Partial<ParticipantRow>): ParticipantRow {
  return {
    id: 1,
    player_id: 1,
    player_name: "Speler",
    points_r1: null,
    points_r2: null,
    points_r3: null,
    ...overrides
  };
}

describe("computeRanking", () => {
  it("ranks participants descending by cumulative round score", () => {
    const result = computeRanking([
      row({ id: 1, player_id: 1, player_name: "Anna", points_r1: 10, points_r2: 8, points_r3: 12 }),
      row({ id: 2, player_id: 2, player_name: "Bram", points_r1: 15, points_r2: 5, points_r3: 5 })
    ]);
    const anna = result.participants.find((p) => p.player_name === "Anna")!;
    const bram = result.participants.find((p) => p.player_name === "Bram")!;
    expect(anna.total_points).toBe(30);
    expect(bram.total_points).toBe(25);
    expect(anna.rank_r3).toBe(1);
    expect(bram.rank_r3).toBe(2);
  });

  it("leaves rank and total blank when a round score is unknown", () => {
    const result = computeRanking([row({ points_r1: 10, points_r2: null, points_r3: null })]);
    expect(result.participants[0].rank_r2).toBeNull();
    expect(result.participants[0].rank_r3).toBeNull();
    expect(result.participants[0].total_points).toBeNull();
  });

  it("flags ties in the final totals", () => {
    const result = computeRanking([
      row({ id: 1, player_id: 1, points_r1: 10, points_r2: 10, points_r3: 10 }),
      row({ id: 2, player_id: 2, points_r1: 15, points_r2: 5, points_r3: 10 })
    ]);
    expect(result.tieErrors.length).toBeGreaterThan(0);
  });
});

describe("canLockEvent", () => {
  it("blocks locking when a score is missing", () => {
    const { participants, tieErrors } = computeRanking([row({ points_r1: 10, points_r2: null, points_r3: null })]);
    expect(canLockEvent(participants, tieErrors).allowed).toBe(false);
  });

  it("allows locking despite a tie warning", () => {
    const { participants, tieErrors } = computeRanking([
      row({ id: 1, player_id: 1, points_r1: 10, points_r2: 10, points_r3: 10 }),
      row({ id: 2, player_id: 2, points_r1: 10, points_r2: 10, points_r3: 10 })
    ]);
    expect(canLockEvent(participants, tieErrors).allowed).toBe(true);
  });

  it("blocks locking with more than 60 participants", () => {
    const rows = Array.from({ length: 61 }, (_, index) =>
      row({ id: index + 1, player_id: index + 1, points_r1: 1, points_r2: 1, points_r3: 1 })
    );
    const { participants, tieErrors } = computeRanking(rows);
    expect(canLockEvent(participants, tieErrors).allowed).toBe(false);
  });
});
