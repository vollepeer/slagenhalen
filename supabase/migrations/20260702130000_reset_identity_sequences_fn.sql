create or replace function reset_identity_sequences()
returns void
language plpgsql
security definer
as $$
begin
  perform setval(pg_get_serial_sequence('players', 'id'), coalesce((select max(id) from players), 0) + 1, false);
  perform setval(pg_get_serial_sequence('seasons', 'id'), coalesce((select max(id) from seasons), 0) + 1, false);
  perform setval(pg_get_serial_sequence('events', 'id'), coalesce((select max(id) from events), 0) + 1, false);
  perform setval(pg_get_serial_sequence('event_participants', 'id'), coalesce((select max(id) from event_participants), 0) + 1, false);
  perform setval(pg_get_serial_sequence('audit_log', 'id'), coalesce((select max(id) from audit_log), 0) + 1, false);
end;
$$;

revoke execute on function reset_identity_sequences() from public;
grant execute on function reset_identity_sequences() to service_role;
