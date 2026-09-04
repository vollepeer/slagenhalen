import { supabaseAdmin } from "./supabaseAdmin";
import type { BackupSnapshot } from "./backup";
import { buildSnapshot } from "./backup";

export async function exportAllData(): Promise<BackupSnapshot> {
  return buildSnapshot();
}

export async function wipeAllData(): Promise<void> {
  await supabaseAdmin.from("audit_log").delete().neq("id", 0);
  await supabaseAdmin.from("event_participants").delete().neq("id", 0);
  await supabaseAdmin.from("events").delete().neq("id", 0);
  await supabaseAdmin.from("seasons").delete().neq("id", 0);
  await supabaseAdmin.from("players").delete().neq("id", 0);
}

export async function importSnapshot(snapshot: BackupSnapshot): Promise<void> {
  await wipeAllData();

  const inserts: Array<[string, unknown[]]> = [
    ["players", snapshot.players],
    ["seasons", snapshot.seasons],
    ["events", snapshot.events],
    ["event_participants", snapshot.eventParticipants],
    ["audit_log", snapshot.auditLog]
  ];
  for (const [table, rows] of inserts) {
    if (rows.length === 0) continue;
    const { error } = await supabaseAdmin.from(table).insert(rows);
    if (error) throw new Error(`Import van ${table} mislukt: ${error.message}`);
  }

  const { error: sequenceError } = await supabaseAdmin.rpc("reset_identity_sequences");
  if (sequenceError) throw new Error(`Sequenties resetten mislukt: ${sequenceError.message}`);
}
