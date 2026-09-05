import { describe, expect, it } from "vitest";
import { createPlayerSchema, updateParticipantSchema, createSeasonSchema } from "./validators";

describe("createPlayerSchema", () => {
  it("accepts a non-empty name", () => {
    expect(createPlayerSchema.safeParse({ name: "Jan" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createPlayerSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("createSeasonSchema", () => {
  it("rejects a topScoresCount below 1", () => {
    expect(createSeasonSchema.safeParse({ name: "2026", topScoresCount: 0 }).success).toBe(false);
  });
});

describe("updateParticipantSchema", () => {
  it("accepts null as an explicit unknown score", () => {
    expect(updateParticipantSchema.safeParse({ pointsR1: null }).success).toBe(true);
  });

  it("rejects a negative score", () => {
    expect(updateParticipantSchema.safeParse({ pointsR1: -1 }).success).toBe(false);
  });
});
