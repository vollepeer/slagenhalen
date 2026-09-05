import { supabaseAdmin } from "./supabaseAdmin";
import { mapSeason, type Season, type SeasonRow } from "./types";

export async function listSeasons(includeArchived: boolean): Promise<Season[]> {
  const { data, error } = await supabaseAdmin.from("seasons").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SeasonRow[];
  return rows
    .filter((row) => includeArchived || !row.is_archived)
    .sort((a, b) => b.id - a.id)
    .map(mapSeason);
}

export async function findSeasonById(id: number): Promise<SeasonRow | null> {
  const { data, error } = await supabaseAdmin.from("seasons").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertSeason(input: {
  name: string;
  topScoresCount: number;
  startDate: string | null;
  endDate: string | null;
}): Promise<SeasonRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .insert({
      name: input.name,
      top_scores_count: input.topScoresCount,
      start_date: input.startDate,
      end_date: input.endDate,
      is_archived: false,
      created_at: now,
      updated_at: now
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeasonRow(
  id: number,
  updates: Partial<Pick<SeasonRow, "name" | "top_scores_count" | "start_date" | "end_date" | "is_archived">>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("seasons")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
