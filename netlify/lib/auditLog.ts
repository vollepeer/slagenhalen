import { supabaseAdmin } from "./supabaseAdmin";

export async function insertAuditLog(entry: {
  entityType: string;
  entityId: number;
  action: string;
  userId: string;
  userEmail: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_log").insert({
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    old_value: null,
    new_value: null,
    user_id: entry.userId,
    user_email: entry.userEmail,
    created_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
}
