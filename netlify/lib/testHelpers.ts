import { supabaseAdmin } from "./supabaseAdmin";

export async function resetDatabase(): Promise<void> {
  await supabaseAdmin.from("audit_log").delete().neq("id", 0);
  await supabaseAdmin.from("event_participants").delete().neq("id", 0);
  await supabaseAdmin.from("events").delete().neq("id", 0);
  await supabaseAdmin.from("seasons").delete().neq("id", 0);
  await supabaseAdmin.from("players").delete().neq("id", 0);
}
