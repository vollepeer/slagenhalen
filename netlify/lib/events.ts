import { supabaseAdmin } from "./supabaseAdmin";
import { mapEventSummary, type EventRow, type EventSummary } from "./types";
import type { ParticipantRow } from "./ranking";

export async function listEvents(seasonId: number | null, includeArchived: boolean): Promise<EventSummary[]> {
  const { data, error } = await supabaseAdmin.from("events").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as EventRow[];
  return rows
    .filter((row) => (seasonId === null ? true : row.season_id === seasonId))
    .filter((row) => includeArchived || !row.is_archived)
    .sort((a, b) => b.event_date.localeCompare(a.event_date))
    .map(mapEventSummary);
}

export async function listEventRowsForSeason(seasonId: number): Promise<EventRow[]> {
  const { data, error } = await supabaseAdmin.from("events").select("*").eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

export async function getEventRowById(eventId: number): Promise<EventRow | null> {
  const { data, error } = await supabaseAdmin.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertEvent(input: {
  seasonId: number;
  eventDate: string;
  title: string | null;
  notes: string | null;
  prizeRanks: [number, number, number];
}): Promise<EventRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({
      season_id: input.seasonId,
      event_date: input.eventDate,
      title: input.title,
      notes: input.notes,
      prize_rank_1: input.prizeRanks[0],
      prize_rank_2: input.prizeRanks[1],
      prize_rank_3: input.prizeRanks[2],
      status: "OPEN",
      locked_at: null,
      is_archived: false,
      created_at: now,
      updated_at: now
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEventRow(
  eventId: number,
  updates: Partial<{
    event_date: string;
    title: string | null;
    notes: string | null;
    is_archived: boolean;
    prize_rank_1: number;
    prize_rank_2: number;
    prize_rank_3: number;
    status: "OPEN" | "LOCKED";
    locked_at: string | null;
  }>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("events")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function getParticipants(eventId: number): Promise<ParticipantRow[]> {
  const { data, error } = await supabaseAdmin
    .from("event_participants")
    .select("id, player_id, points_r1, points_r2, points_r3, players(name)")
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((row: any) => ({
    id: row.id as number,
    player_id: row.player_id as number,
    player_name: (row.players?.name as string) ?? "",
    points_r1: row.points_r1 as number | null,
    points_r2: row.points_r2 as number | null,
    points_r3: row.points_r3 as number | null
  }));
  rows.sort((a, b) => a.player_name.localeCompare(b.player_name));
  return rows;
}

export async function countParticipants(eventId: number): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("event_participants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function findParticipant(eventId: number, playerId: number) {
  const { data, error } = await supabaseAdmin
    .from("event_participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertParticipant(eventId: number, playerId: number): Promise<{ id: number }> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("event_participants")
    .insert({
      event_id: eventId,
      player_id: playerId,
      points_r1: null,
      points_r2: null,
      points_r3: null,
      created_at: now,
      updated_at: now
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateParticipantRow(
  participantId: number,
  updates: Partial<{ points_r1: number | null; points_r2: number | null; points_r3: number | null }>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("event_participants")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", participantId);
  if (error) throw new Error(error.message);
}

export async function deleteParticipantRow(eventId: number, participantId: number): Promise<number> {
  const { error, count } = await supabaseAdmin
    .from("event_participants")
    .delete({ count: "exact" })
    .eq("id", participantId)
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
