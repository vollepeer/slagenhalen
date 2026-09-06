import type { BackupSnapshot } from "./backup";

// The pre-migration offline app persisted this shape directly to localStorage and its
// "export" button was a raw JSON.stringify of it. It predates the current Supabase schema,
// so every field is camelCase and IDs/status values (but not field names) already match
// what the current tables expect.
type LegacyPlayer = {
  id: number;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type LegacySeason = {
  id: number;
  name: string;
  topScoresCount: number;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type LegacyEvent = {
  id: number;
  seasonId: number;
  eventDate: string;
  title: string | null;
  notes: string | null;
  prizeRank1: number;
  prizeRank2: number;
  prizeRank3: number;
  status: "OPEN" | "LOCKED";
  lockedAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type LegacyEventParticipant = {
  id: number;
  eventId: number;
  playerId: number;
  pointsR1: number | null;
  pointsR2: number | null;
  pointsR3: number | null;
  createdAt: string;
  updatedAt: string;
};

type LegacyOfflineBackup = {
  meta: { lastIds: Record<string, number> };
  players?: LegacyPlayer[];
  seasons?: LegacySeason[];
  events?: LegacyEvent[];
  eventParticipants?: LegacyEventParticipant[];
  auditLog?: unknown[];
};

export function isLegacyOfflineBackup(payload: unknown): payload is LegacyOfflineBackup {
  if (!payload || typeof payload !== "object") return false;
  const meta = (payload as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return false;
  return "lastIds" in meta;
}

export function convertLegacyOfflineBackup(legacy: LegacyOfflineBackup): BackupSnapshot {
  return {
    createdAt: new Date().toISOString(),
    players: (legacy.players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      is_archived: p.isArchived,
      created_at: p.createdAt,
      updated_at: p.updatedAt
    })),
    seasons: (legacy.seasons ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      top_scores_count: s.topScoresCount,
      start_date: s.startDate,
      end_date: s.endDate,
      is_archived: s.isArchived,
      created_at: s.createdAt,
      updated_at: s.updatedAt
    })),
    events: (legacy.events ?? []).map((e) => ({
      id: e.id,
      season_id: e.seasonId,
      event_date: e.eventDate,
      title: e.title,
      notes: e.notes,
      prize_rank_1: e.prizeRank1,
      prize_rank_2: e.prizeRank2,
      prize_rank_3: e.prizeRank3,
      status: e.status,
      locked_at: e.lockedAt,
      is_archived: e.isArchived,
      created_at: e.createdAt,
      updated_at: e.updatedAt
    })),
    eventParticipants: (legacy.eventParticipants ?? []).map((p) => ({
      id: p.id,
      event_id: p.eventId,
      player_id: p.playerId,
      points_r1: p.pointsR1,
      points_r2: p.pointsR2,
      points_r3: p.pointsR3,
      created_at: p.createdAt,
      updated_at: p.updatedAt
    })),
    // The legacy app had no auth system, so its audit entries carry no user attribution and
    // don't map to the current schema's user_id/user_email columns — dropped, not migrated.
    auditLog: []
  };
}
