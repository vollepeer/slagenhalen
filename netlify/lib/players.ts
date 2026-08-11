import { supabaseAdmin } from "./supabaseAdmin";
import { mapPlayer, type Player, type PlayerRow } from "./types";

export async function listPlayers(query: string, includeArchived: boolean): Promise<Player[]> {
  const { data, error } = await supabaseAdmin.from("players").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PlayerRow[];
  const normalizedQuery = query.trim().toLowerCase();
  return rows
    .filter((row) => includeArchived || !row.is_archived)
    .filter((row) => (normalizedQuery ? row.name.toLowerCase().includes(normalizedQuery) : true))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(mapPlayer);
}

export async function findPlayerByName(name: string, excludeId?: number): Promise<PlayerRow | null> {
  const { data, error } = await supabaseAdmin.from("players").select("*");
  if (error) throw new Error(error.message);
  const target = name.trim().toLowerCase();
  return ((data ?? []) as PlayerRow[]).find((row) => row.id !== excludeId && row.name.trim().toLowerCase() === target) ?? null;
}

export async function getPlayerById(id: number): Promise<PlayerRow | null> {
  const { data, error } = await supabaseAdmin.from("players").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertPlayer(name: string): Promise<PlayerRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("players")
    .insert({ name, is_archived: false, created_at: now, updated_at: now })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePlayerRow(
  id: number,
  updates: Partial<Pick<PlayerRow, "name" | "is_archived">>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("players")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
