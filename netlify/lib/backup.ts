import { supabaseAdmin } from "./supabaseAdmin";

export type BackupSnapshot = {
  createdAt: string;
  players: unknown[];
  seasons: unknown[];
  events: unknown[];
  eventParticipants: unknown[];
  auditLog: unknown[];
};

async function fetchAll(table: string): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin.from(table).select("*");
  if (error) throw new Error(`Kon tabel ${table} niet lezen: ${error.message}`);
  return data ?? [];
}

export async function buildSnapshot(): Promise<BackupSnapshot> {
  const [players, seasons, events, eventParticipants, auditLog] = await Promise.all([
    fetchAll("players"),
    fetchAll("seasons"),
    fetchAll("events"),
    fetchAll("event_participants"),
    fetchAll("audit_log")
  ]);
  return { createdAt: new Date().toISOString(), players, seasons, events, eventParticipants, auditLog };
}
