-- ═══════════════════════════════════════════════════════════════════════════
-- Entries dual-scoping — an entry (task/milestone/meeting) can now belong
-- either to a project+phase, or to an incident, never both. This is what
-- lets Incident "Tasks" reuse the exact same Entry engine (dates, cascade,
-- critical path, status) as the Project Plan, and surface in the shared
-- Task Base (/tasks) and Kanban.
-- ═══════════════════════════════════════════════════════════════════════════

alter table entries add column if not exists incident_id uuid references incidents(id) on delete cascade;
create index if not exists entries_incident_id_idx on entries(incident_id);

-- project_id/phase_id are already nullable (confirmed via introspection) —
-- no ALTER needed there. Not adding a CHECK constraint enforcing
-- "exactly one of project+phase OR incident" at the DB level, since no
-- other table in this schema uses CHECK constraints (confirmed via
-- introspection — validation is done in the app code, not the DB) and
-- adding the first one here would be an inconsistent, isolated exception.
-- The app is responsible for never setting both scopes on the same row.
