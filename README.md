# OpEn

> Internal project-management tool for Ploomes' Onboarding/Expansion (OE) team — tracks project plans, baselines, risks, delays, and a project diary for client onboarding and implementation engagements.

## Overview

OpEn is a single-page React application used internally to plan, track, and report on client-facing implementation projects (e.g. "Nova Conta" onboarding and "Novo Projeto" custom-development engagements). Each project has a phased task plan with dependency-aware date scheduling, a baseline-vs-actual variance model, a risk register, a delay log with root-cause tagging, and a "project diary" (open points, meeting logs, and an audit history timeline). The app also provides a cross-project Kanban/task board, CSV/JSON export, JSON import (create or merge), and a branded HTML status report generator.

It is built for project managers and dev leads inside Ploomes who need a lightweight, opinionated alternative to spreadsheets for running onboarding/implementation projects — with automatic critical-path highlighting, business-day-aware scheduling (respecting configurable holidays and work week), and delay accountability (who/what caused a slip).

The codebase is a client-only Vite/React SPA backed directly by Supabase (Postgres + Auth + Storage) — there is no custom backend server; all business logic (date cascading, critical path, auto-status) runs in the browser inside a single Zustand store. Auth is restricted to Google OAuth, optionally locked to a corporate email domain. Based on the code present (version `0.1.0`, no CI configuration, one schema migration file covering only part of the schema), this reads as an actively-developed internal tool rather than a fully hardened production product — see [Known Issues](#known-issues) for specifics.

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | ^18.3.1 | UI library |
| TypeScript | ^5.5.3 | Static typing (strict mode) |
| Vite | ^5.4.8 | Dev server & build tool |
| Tailwind CSS | ^3.4.13 | Utility-first styling |
| Zustand | ^4.5.5 | Global state (single store + auth/toast stores), with `persist` middleware |
| TanStack Table (react-table) | ^8.20.5 | Project Plan table (grouping, expand/collapse, column visibility) |
| date-fns | ^3.6.0 | Date parsing/formatting/arithmetic |
| dnd-kit (`core`, `sortable`, `utilities`) | ^6.1.0 / ^8.0.0 / ^3.2.2 | Drag-and-drop for Kanban boards and the Template Editor |
| i18next / react-i18next | ^23.14.0 / ^15.0.2 | UI translations (pt/en/es) |
| Supabase JS | ^2.104.1 | Postgres data access, Google OAuth, file storage |
| react-router-dom | ^6.26.2 | Client-side routing |
| xlsx (SheetJS) | ^0.18.5 | XLSX export (`utils/exportXlsx.ts` — implemented but **not wired to any UI button**, see Known Issues) |
| jsPDF | ^4.2.1 | Declared dependency — **not imported anywhere in `src/`** (unused; the status report is generated as HTML, not a real PDF) |
| html2canvas | ^1.4.1 | Declared dependency — **not imported anywhere in `src/`** (unused) |
| uuid | ^10.0.0 | Client-side ID generation for optimistic local records |
| Supabase CLI | ^2.95.3 (devDependency) | Local Supabase dev / type generation / migrations |

Build scripts (from `package.json`): `npm run dev` (Vite dev server), `npm run build` (`tsc && vite build` — type-checks before bundling), `npm run preview` (serve the production build locally).

## Architecture

### Project Structure

```
src/
├── App.tsx                 # Route table + auth bootstrap (session check, onAuthStateChange)
├── main.tsx                # Entry point — mounts <App/> inside BrowserRouter, loads i18n
├── index.css                # Global styles / CSS variables (design tokens)
├── vite-env.d.ts            # Vite client type reference
├── lib/
│   └── supabase.ts          # Supabase client singleton (reads VITE_SUPABASE_* env vars)
├── store/
│   └── useAppStore.ts       # THE main Zustand store — all project/settings state + Supabase I/O (2090 lines)
├── stores/
│   ├── useAuthStore.ts      # Auth session/profile state (Supabase Auth)
│   └── useToastStore.ts     # Global toast notification queue
├── types/
│   ├── index.ts             # Store-facing (camelCase) domain types: Entry, Phase, Project, Risk, etc.
│   ├── database.ts          # DB-facing (snake_case) row types + full-project fetch/write bundles
│   └── supabase.ts          # Placeholder stub for `supabase gen types typescript` output (not yet generated)
├── utils/
│   ├── dateEngine.ts         # Roll-up, cascade-forward, variance, duration recalculation, applyDateChange pipeline
│   ├── businessDays.ts       # Workday arithmetic (holidays + Mon–Fri/Mon–Sat)
│   ├── criticalPath.ts       # Longest-path critical-path computation over the dependency graph
│   ├── statusCalc.ts         # Auto status derivation (pending/in_progress/done/overdue) vs manual override
│   ├── projectStats.ts       # Project-level duration/variance/date-range/unique-client-PM-member helpers
│   ├── dbConversions.ts      # DB row (snake_case) ⇄ store type (camelCase) mapping, both directions
│   ├── exportJson.ts         # Single-project and full-backup JSON export
│   ├── exportCsv.ts          # Project Plan → CSV export
│   ├── exportXlsx.ts         # Project Plan → XLSX export (unused by the UI — see Known Issues)
│   ├── importJson.ts         # JSON import validation + new-project / merge-or-replace-update builders
│   └── statusReport.ts       # HTML status report generator (standard + "Ploomes branded" layouts)
├── hooks/
│   └── useSmartPosition.ts   # Viewport-aware popover/dropdown positioning hook
├── i18n/
│   ├── index.ts              # i18next init (pt default, en/es fallback resources)
│   └── locales/{pt,en,es}.json
├── components/
│   ├── layout/                # Layout shell (Sidebar + Outlet + Toaster) and Sidebar nav
│   ├── ui/                    # Shared primitives: Badge, Button, Modal, Input/Select/Textarea/Field, Toaster, DelayModal*
│   ├── plan/                  # Project Plan building blocks: EntryModal, AddEntryModal*, CommentsPanel, OwnersField
│   ├── diary/                 # DiaryComments, FileAttachments (Supabase Storage upload/signed-URL/remove)
│   ├── report/                # ReportConfigModal (status report section/column config)
│   ├── import/                # ImportJsonModal (validate + preview + new/merge/replace import)
│   └── StatusBadge.tsx, ProtectedRoute.tsx
└── pages/
    ├── ProjectsPage.tsx        # Portfolio — list/Kanban of all projects, filters, creation, archive, backup
    ├── ProjectDetailPage.tsx   # Project workspace shell — tab bar + topbar (status, export, duplicate, archive)
    ├── tabs/{OverviewTab,CharterTab,TeamTab,DiaryTab}.tsx
    ├── tabs/diary/{OpenPointsTab,MeetingsTab,HistoryTab}.tsx
    ├── PlanPage.tsx            # Project Plan — the phase/entry/subtask table with inline date editing & cascading
    ├── RisksPage.tsx           # Risk register
    ├── DelayLogPage.tsx        # Delay log with responsibility/type breakdown charts
    ├── KanbanPage.tsx          # Per-project Kanban board (+ "Internal tasks" section for hidden entries)
    ├── TasksPage.tsx           # Cross-project "Task Base" Kanban (`/tasks`)
    ├── SettingsPage.tsx        # Language, date format, workdays, holidays, clients, templates, archived projects
    ├── TemplateEditorPage.tsx  # Drag-and-drop phase/entry template editor
    ├── LoginPage.tsx           # Google OAuth sign-in
    └── AuthCallback.tsx        # OAuth redirect handler + optional email-domain allowlist check

supabase/
└── migrations/20260430_diary.sql   # Only migration file present — covers open_points, meeting_logs, history, diary_comments (+ commented-out storage bucket policy). Core tables (projects, phases, entries, comments, risks, delay_log, settings, profiles) have NO migration file in this repo — see Supabase Setup below, where their schema is reconstructed from src/types/database.ts.
```

*`AddEntryModal.tsx` and `components/ui/DelayModal.tsx` are marked with `*` above — reading the current page code, neither appears to be imported by any live route; `EntryModal.tsx` and a locally-defined `DelayModal` inside `PlanPage.tsx` are what's actually wired in. They look like superseded/duplicate implementations (see [Known Issues](#known-issues)).

### State Management

The app uses three separate Zustand stores rather than one global store:

| Store | File | Persist? | Manages |
|---|---|---|---|
| `useAppStore` | `src/store/useAppStore.ts` | Yes (partial) | All project data, global settings, templates — the app's core domain state |
| `useAuthStore` | `src/stores/useAuthStore.ts` | No | Supabase auth session (`user`), `profiles` row, loading flag |
| `useToastStore` | `src/stores/useToastStore.ts` | No | Ephemeral toast notification queue (auto-dismiss after 4s) |

#### `useAppStore` (the main store)

**State**: `projects` (active, non-archived — loaded eagerly), `projectsLoading`, `projectSaving`, `archivedProjects` (loaded lazily), `archivedProjectsLoaded`, and `settings` (`holidays`, `holidayNames`, `templates`, `templatesVersion`, `defaultLanguage`, `dateFormat`, `workdays`, `clients`, `sidebarCollapsed`).

**Persist middleware**: uses Zustand's `persist` under localStorage key `open-store`, but only `partialize`s `settings.templates`, `settings.templatesVersion`, and `settings.sidebarCollapsed` into localStorage — `projects`, `archivedProjects`, and the rest of `settings` (holidays, language, date format, workdays, clients) are treated as server-of-record and reloaded from Supabase on every app start (`loadProjects`/`loadSettings`/`loadArchivedProjects`). A custom `merge` function compares the persisted `templatesVersion` against a module constant `TEMPLATES_VERSION = 2`; if the persisted value is stale, the two built-in default templates (`DEFAULT_TEMPLATES`) are re-applied — this is the app's only template-migration mechanism.

**Update pattern**: virtually every mutating action is **optimistic** — it updates local state synchronously, then fires an async Supabase call via a small `sync(fn, revert?)` helper; on failure, the optional `revert` callback restores the prior state and a toast is shown. `createProject`/`duplicateProject`/`importProject` instead use their own inline try/catch/finally (with a `projectSaving` flag) since they need to know the outcome before navigating. Notably, the Diary actions (open points, meetings, meeting items, history, diary comments — add/update paths) call `sync()` **without** a `revert` callback, so a failed write there leaves the optimistic UI state un-rolled-back (only a toast fires) — an inconsistency versus the rest of the store.

**Key methods** (grouped; see [API Reference](#api-reference-supabase) for the exact Supabase operations behind each):
- Load: `loadProjects`, `loadSettings`, `loadArchivedProjects`
- Projects: `createProject`, `duplicateProject`, `updateProject`, `deleteProject`, `importProject`, `archiveProject`, `unarchiveProject`
- Phases: `addPhase`, `updatePhase`, `deletePhase`, `reorderPhases`
- Entries: `addEntry`, `addSubtask`, `updateEntry`, `deleteEntry`, `moveEntryToPhase`, `updateEntryStatus`, `resetStatusOverride`, `recalculateStatuses`, `updateEntryRisk`, `changeEntryDate` (the cascade/critical-path/auto-status pipeline — see [Date Engine](#date-engine)), `addEntryLink`/`removeEntryLink`, `addComment`/`removeComment`
- Baseline: `setBaseline`, `clearBaseline`
- Risks: `addRisk`, `updateRisk`, `deleteRisk`, plus nested `addActionTask`/`updateActionTask`/`toggleActionTask`/`deleteActionTask`
- Delay log: `addDelayLogEntry`, `updateDelayLogEntry`, `deleteDelayLogEntry`
- Team/links: `addTeamMember`/`updateTeamMember`/`removeTeamMember`, `addProjectLink`/`removeProjectLink`
- Settings: `updateSettings`, `updateTemplate` (local-only, not synced to Supabase), `addHoliday`/`removeHoliday`, `addClient`/`removeClient`
- Diary: `addOpenPoint`/`updateOpenPoint`/`resolveOpenPoint`/`deleteOpenPoint`, `addMeetingLog`/`updateMeetingLog`/`deleteMeetingLog` + `addMeetingItem`/`updateMeetingItem`/`deleteMeetingItem`, `addHistoryEntry`/`updateHistoryEntry`/`deleteHistoryEntry`, `addDiaryComment`/`deleteDiaryComment`, `addDiaryAttachment`/`removeDiaryAttachment` (local-only — actual upload/delete happens in the `FileAttachments` component against Supabase Storage, not through the store)
- Column prefs: `setColumnVisibility` (local only — `columnVisibility` is not a column in the `projects` table and is never synced)

No real-time subscriptions exist anywhere in the store (no `supabase.channel()`/`postgres_changes` usage) — all reads are one-shot fetches on load/navigation, so concurrent editors won't see each other's changes without a manual reload.

#### `useAuthStore`

State: `user` (Supabase `User`), `profile` (`profiles` table row), `loading`. Methods: `signInWithGoogle` (Supabase OAuth, redirects to `/auth/callback`), `signOut`, `initialize` (session check on mount — sets `user` immediately, loads `profile` in the background so the auth gate isn't blocked on it), `loadProfile` (full reload, used after `SIGNED_IN` events).

#### `useToastStore`

State: `toasts: {id, message, type}[]`. `addToast(message, type='error')` auto-removes the toast after 4000ms; `removeToast(id)` for manual/click dismissal.

### Database (Supabase)

The app talks directly to Postgres through `@supabase/supabase-js` — there is no ORM and no server-side API layer. Row-level security (RLS) is expected to scope every table to `created_by = auth.uid()` (directly, or via a join to `projects` for child tables), following the pattern established in the one migration file that does exist (`supabase/migrations/20260430_diary.sql`).

**Only four tables have a migration file in this repo**: `open_points`, `meeting_logs`, `history`, `diary_comments` (plus a commented-out Storage bucket policy). The remaining tables below (`profiles`, `projects`, `phases`, `entries`, `comments`, `risks`, `delay_log`, `settings`) are used extensively by `src/store/useAppStore.ts` and typed in `src/types/database.ts`, but **no CREATE TABLE migration exists for them in the codebase** — their schema in this README is reconstructed from those two sources and should be reviewed before running in production. See [Supabase Setup](#supabase-setup) for the full, runnable SQL.

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| `profiles` | One row per authenticated user (name/avatar shown in comments, diary, sidebar) | `id` (= `auth.users.id`), `email`, `name`, `avatar_url` | Not in repo — recommended: own-row only |
| `projects` | One row per project | `name`, `client`, `type`, `pm`, `dev_lead`, `dev_type`, `language`, `status`, `baseline_set_at`, `charter` (jsonb), `team`/`links` (jsonb), `archived` | Not in repo — recommended: `created_by = auth.uid()` |
| `phases` | Ordered phases within a project | `project_id`, `name`, `order` | Not in repo — recommended: via `projects` join |
| `entries` | Tasks/milestones/meetings within a phase (subtasks embedded as JSON, not separate rows) | `project_id`, `phase_id`, `type`, `name`, planned/baseline/actual date fields, `duration_days`/`duration_hours`, `status`, `risk_flag`, `depends_on` (jsonb), `subtasks`/`links`/`owners` (jsonb), `hidden_from_plan`, `parent_entry_id` | Not in repo — recommended: via `projects` join |
| `comments` | Top-level comments on an entry | `project_id`, `entry_id`, `author_name`, `text` | Not in repo — recommended: via `projects` join |
| `risks` | Risk register rows | `project_id`, `description`, `probability`, `impact`, `score`, `status`, `owner`, `linked_entry_ids` (jsonb), `action_tasks` (jsonb) | Not in repo — recommended: via `projects` join |
| `delay_log` | Delay log rows (manual + cascade-triggered) | `project_id`, `entry_id`, `entry_name`, `days`, `responsibility`, `type`, `triggered_by` | Not in repo — recommended: via `projects` join |
| `settings` | Single global config row (`key='config'`) | `key`, `value` (jsonb: holidays, holidayNames, defaultLanguage, dateFormat, workdays, clients) | Not in repo — recommended: any authenticated user (shared, app-wide config) |
| `open_points` | Diary open points | `project_id`, `title`, `status`, `priority`, `due_date`, `linked_entry_id` | ✅ In migration — via `projects.created_by = auth.uid()` |
| `meeting_logs` | Diary meeting logs (items embedded as jsonb) | `project_id`, `title`, `date`, `items` (jsonb) | ✅ In migration — via `projects.created_by = auth.uid()` |
| `history` | Diary audit timeline | `project_id`, `event`, `title`, `is_manual_note` | ✅ In migration — via `projects.created_by = auth.uid()` |
| `diary_comments` | Comments shared across open_points/meetings/history | `project_id`, `parent_type`, `parent_id`, `author_name`, `text` | ✅ In migration — via `projects.created_by = auth.uid()` |

Storage: a single bucket, **`project-files`** (private, not public), used by `FileAttachments` for open-point/meeting attachments. Uploads go to `{projectId}/{parentId}/{timestamp}_{filename}`; reads use 7-day signed URLs generated client-side (`createSignedUrl`) rather than public URLs. Bucket creation + policies are present only as commented-out SQL in the migration file (not applied automatically).

### Date Engine

The scheduling logic lives in `src/utils/dateEngine.ts`, `businessDays.ts`, and `criticalPath.ts`, and is orchestrated together only inside the store's `changeEntryDate` action.

**`businessDays.ts`** — the workday primitives:
- `addWorkdays(start, days, holidays, workdays='mon-fri')` — steps forward/backward by calendar day, skipping weekends (Sun only if `workdays='mon-sat'`; Sat+Sun if `'mon-fri'`) and any date in `holidays`.
- `workdaysBetween(start, end, holidays, workdays)` — signed workday count between two dates (used for variance and delay-day computation).

**`dateEngine.ts`** — the entry-level pipeline:
- `rollUpEntry(parent)` — re-derives a parent entry's `plannedStart`/`plannedEnd` from the min/max of its subtasks' dates (preferring `actualEnd` over `plannedEnd` for done subtasks).
- `cascadeForward(project, changedEntryId, holidays)` — the **3-step propagation logic**: (1) build a reverse-dependency map (`dependents: id → [ids that depend on it]`); (2) breadth-first walk forward from the changed entry, and for every direct/transitive dependent whose own end date isn't already fixed (`actualEnd` set), push its start to 1 workday after the predecessor's new end date, then recompute its own end from its stored duration; (3) re-apply `rollUpEntry` to any parent whose subtasks were touched. Entries with an `actualEnd` already set are **never** cascaded into — completed work is treated as immovable.
- `computeVariance(entry, holidays)` — workday delta between `baselineEnd`/`baselineDate` and `plannedEnd`/`plannedDate`.
- `recalcDuration(entry, holidays)` — re-derives `durationDays` from `plannedStart`↔`plannedEnd` (tasks only).
- `applyDateChange(project, entryId, field, value, holidays)` — the full pipeline: (1) write the changed field onto the entry (or its subtask) and recompute duration/end-shift on the direct edit; (2) if the edited field was `plannedStart`/`plannedEnd`/`plannedDate`, call `cascadeForward` to propagate the change to dependents. The store then also runs `applyIsCritical` and `applyAutoStatus` over the result (see below) — so a single date edit can ripple through duration, dependents' dates, critical-path membership, and status, all in one store action.

**`criticalPath.ts`** — `computeCriticalPath(phases)` runs a memoised DFS computing each entry's earliest-finish-time from its own end date and its predecessors' EFTs (measured in **calendar** days from a fixed epoch, not workdays), then backtracks from the maximum-EFT node(s) through the `dependsOn` graph to mark every entry on that longest chain as critical. `applyIsCritical(phases)` applies the resulting `isCritical` flag to every entry and subtask. This is a simplified longest-path approximation, not a full CPM float calculation (no early/late start-finish or slack is computed).

### i18n

- **Supported languages**: Portuguese (`pt`, default/fallback), English (`en`), Spanish (`es`) — `src/i18n/locales/{pt,en,es}.json`, ~280 keys each, structurally identical.
- **Two independent language concepts**:
  - **System/UI language** — `settings.defaultLanguage`, changed in Settings, drives `i18next`'s active language for the whole interface (menus, labels, buttons) via `react-i18next`.
  - **Project language** — `project.language` (`pt`/`en`/`es`), chosen once at project creation. It is used **only** to resolve a template's `nameKey`s (e.g. `tpl.nc.p1`) into localized phase/entry names at the moment a project is instantiated from a template (`i18n.t(key, { lng: project.language })`); after creation, phase/entry names are plain stored strings and do not re-translate if the project or system language later changes.
- Status report generation (`statusReport.ts`) uses the **current system** `i18n.language`, not the project's language.

## Features

### Portfolio
List/Kanban toggle (persisted to `localStorage`); filter by client, PM, project type, and dev-presence; two-step "New Project" flow (pick a template card, then fill in client/name/PM/language and optional dev fields); archive/unarchive with a lazy-loaded archived list; per-project duration (working days) and end-date variance columns; JSON import (new project) and full-portfolio JSON backup export (optionally including archived projects).

### Project Workspace
A per-project shell (`ProjectDetailPage`) with a tab bar — Overview, Charter, Team, Plan, Kanban, Risks, Delay Log, Diary (badge counts on Risks/Delay Log/Team/Diary) — plus a topbar for status change, status-report export, CSV export (Plan tab only), and a "More" menu (import update, export JSON, duplicate, archive). Subheader chips surface client/PM/dev info, baseline duration, a detected "Go-live" milestone date, and the current active phase.
- **Overview**: autosaved free-text notes (700ms debounce) and an external-links list.
- **Charter**: autosaved structured PMBOK-style fields — sponsor, budget, objectives, scope, out-of-scope, success criteria, constraints, assumptions.
- **Team**: member list with role badges (PM, Dev Lead, Desenvolvedor, Consultor, Analista, Cliente, Patrocinador, or custom), add/edit/delete.

### Project Plan
A TanStack Table–powered tree table (`PlanPage.tsx`): phases as collapsible group headers, entries and their subtasks/child-meetings as nested rows. Inline-editable date cells trigger the cascade engine; editing a *planned* date that shifts the workday count opens a **delay-justification modal** (description, responsibility, type) that logs a `DelayLogEntry`, or can be skipped. Toggleable columns (Responsible, Dependencies, Baseline dates, Variance, Duration, Status, etc.) persist per project. Dependency picking is a per-phase checklist that blocks circular dependencies. `EntryModal` is the shared create/edit dialog for tasks/milestones/meetings across Plan, Kanban, and the Task Base — supporting owners (team member or free text), links, comments (edit mode), a "Show in plan" (`hiddenFromPlan`) toggle, and cross-project/cross-phase moves.

### Risk Management
Risk register with `score = probability(1–3) × impact(1–3)` (1–9), color-banded (≥6 red / ≥3 amber / else green); status (Identificado/Em monitoramento/Mitigado/Aceito/Fechado), owner, due date, and a checklist linking the risk to one or more Plan entries. Each risk has a nested **action-task** sub-list (description, responsible, due date, done checkbox) shown in a detail side panel.

### Delay Log
Manual entries (gated behind "no baseline set yet" warning) and automatic entries created by the Plan tab's cascade flow (`triggeredBy: 'cascade'` vs `'manual'`, shown with an "Auto"/"Manual" origin badge). Taxonomy: responsibility (`internal`, `client_business`, `client_it`, `client_provider`) and type (`execution`, `definition`, `planning`). Summary cards (total + per-responsibility day totals) and a stacked horizontal distribution bar chart.

### Diary (Open Points, Meetings, History)
- **Open Points**: title/description, priority (low/medium/high), responsible, due date, status (open/resolved with a resolution note + resolver), optional link to a Plan entry, comments, and file attachments.
- **Meetings**: date/duration/location/attendees/objective/notes, plus a checklist of **meeting items** (type: action/decision/info; done flag; optional responsible), comments, and file attachments. Note: `MeetingItem`/i18n include "promote to Open Point" / "promote to Task" concepts (`promotedToOpenPointId`/`promotedToEntryId` fields, `promoteToOp`/`promoteToTask` translation strings), but no promote action is actually wired into `MeetingsTab.tsx` — see [Known Issues](#known-issues).
- **History**: an auto-generated, reverse-chronological audit timeline (project created, status changed, baseline set, risk added, delay logged, member added) plus manually-added free-text notes (the only entries that can be edited/deleted from the UI); each entry has its own comment thread.
- File attachments and comments in all three sub-tabs share `FileAttachments` (Supabase Storage, `project-files` bucket, signed URLs) and `DiaryComments` components.

### Task Base (`/tasks`)
A cross-project Kanban board of every task/meeting entry (including subtasks) across all non-archived projects **that has at least one owner assigned**, regardless of its `hiddenFromPlan` flag. Filterable by project, team member, and status; drag-and-drop between the 4 status columns (pending/in_progress/done/blocked) updates status directly.

### Kanban (per project)
Same 4-status-column board scoped to one project, split into the normal board (visible entries) and a collapsible **"Internal tasks"** section for entries flagged `hiddenFromPlan` (i.e., hidden from the Plan tab but still tracked here and in the Task Base).

### Export (JSON, CSV, Status Report)
- **JSON**: single-project export (`exportProjectToJson`) and full-portfolio backup (`exportAllProjectsToJson`, optionally including archived projects) — both trigger a browser download, no server round-trip.
- **CSV**: `exportProjectCsv` — one row per entry/subtask/child-meeting with phase, level, type, dependencies (resolved to names), planned/baseline/actual dates, variance, duration, status, risk, and critical-path flag; UTF-8 BOM for Excel compatibility.
- **Status Report**: `ReportConfigModal` lets you pick a layout (`standard` or `ploomes` branded), which sections to include (summary/team/charter/milestones/plan/delay log/risks), and — if the plan section is on — which Plan columns to include. `generateStatusReport` renders a self-contained HTML document (inline CSS, Google Fonts link) and opens it in a new tab via `window.open` on a `Blob` URL; there is **no actual PDF generation** despite jsPDF being a listed dependency (see Known Issues) — "printing to PDF" would rely on the browser's own print dialog.
- **XLSX**: `exportProjectXlsx` is fully implemented (`utils/exportXlsx.ts`) but is **not called from any page or component** — currently dead code from the UI's perspective.

### Import (JSON)
`ImportJsonModal` supports two modes: **New project** (paste JSON → validate → preview counts → create) and **Update existing project**, with a **Replace** (full overwrite of plan/team/charter, keeps delay log & baseline) or **Merge/Patch** (adds new phases/entries/risks, updates existing ones by name-match, removes nothing) sub-mode. Validation (`validateImportJson`) checks required fields, valid entry types, broken `dependsOn` references, and circular dependencies before allowing import.

### Authentication
Google OAuth only, via Supabase Auth (`signInWithOAuth({ provider: 'google' })`), redirecting to `/auth/callback`. `AuthCallback` optionally enforces a corporate email domain via the `VITE_ALLOWED_EMAIL_DOMAIN` env var (signs the user back out and redirects to `/login?error=unauthorized` if the email doesn't match). `ProtectedRoute` gates all authenticated routes behind a valid session, redirecting unauthenticated users to `/login`.

### Settings
System language (pt/en/es), date display format (DD/MM/YYYY or MM/DD/YYYY), workdays (Mon–Fri or Mon–Sat), a holiday list (date + optional name), an explicit client list (unioned with clients auto-derived from existing projects), the two built-in project templates (edit via a dedicated drag-and-drop `TemplateEditorPage`), and an archived-projects panel with per-project "Unarchive."

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL — `src/lib/supabase.ts` throws at startup if missing |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public API key — same startup guard as above |
| `VITE_ALLOWED_EMAIL_DOMAIN` | No | If set, `AuthCallback` signs out and rejects any Google login whose email doesn't end in `@<domain>` |

These are the only three `import.meta.env.VITE_*` references found anywhere in `src/`. The repo ships a file named `env.local` (not `.env.local`) at the project root with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` placeholders — note the missing leading dot means Vite will **not** pick it up automatically; rename it to `.env.local` for local development (this also matches what `.gitignore` excludes).

## Setup & Installation

### Prerequisites
- **Node.js** — no version is pinned in `package.json` (no `engines` field) and there's no `.nvmrc`; Vite 5 requires Node.js 18+ (Node 20 LTS recommended).
- npm (a `package-lock.json` with `lockfileVersion: 3` is committed — use `npm`, not yarn/pnpm, to stay in sync with it).
- A Supabase project (Postgres + Auth + Storage).
- A Google Cloud Console project configured for OAuth (for Google sign-in).

### Local Development

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` in the project root (rename the shipped `env.local` or create fresh) with the variables from [Environment Variables](#environment-variables).
4. Set up the Supabase project — see [Supabase Setup](#supabase-setup) below (tables, RLS, storage bucket, Google OAuth provider).
5. Run the dev server:
   ```bash
   npm run dev
   ```

### Supabase Setup

#### Database Tables

Run the migration that ships with the repo first, then create the remaining tables (not present as a migration in this repo — reconstructed from `src/types/database.ts` and the query patterns in `src/store/useAppStore.ts`; review before applying to production).

**1. Ships with the repo** — apply as-is via the Supabase CLI or SQL editor:

```bash
supabase db push   # or run supabase/migrations/20260430_diary.sql directly in the SQL editor
```

This creates `open_points`, `meeting_logs`, `history`, `diary_comments` with RLS policies scoped through `projects.created_by = auth.uid()`, plus commented-out Storage bucket policies for `project-files` (see step 3).

**2. Core tables — not in the repo, reconstructed:**

```sql
-- profiles: one row per authenticated user
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view and edit their own profile"
  on profiles for all
  using (id = auth.uid());

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- projects
create table if not exists projects (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  client           text,
  type             text check (type in ('nova_conta', 'novo_projeto')),
  pm               text,
  dev_lead         text,
  dev_type         text check (dev_type in ('integration', 'application')),
  dev_integration  text,
  language         text check (language in ('pt', 'en', 'es')),
  status           text check (status in ('planning', 'in_progress', 'delayed', 'done')),
  baseline_set_at  timestamptz,
  charter          jsonb,
  overview         text,
  links            jsonb,
  team             jsonb,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  updated_at       timestamptz,
  updated_by       uuid references auth.users(id) on delete set null
);

alter table projects enable row level security;

create policy "Users can manage their own projects"
  on projects for all
  using (created_by = auth.uid());

-- phases
create table if not exists phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  "order"     integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists phases_project_id_idx on phases(project_id);
alter table phases enable row level security;

create policy "Users can manage phases of their projects"
  on phases for all
  using (exists (select 1 from projects p where p.id = phases.project_id and p.created_by = auth.uid()));

-- entries (subtasks are embedded as jsonb, not separate rows)
create table if not exists entries (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references projects(id) on delete cascade,
  phase_id               uuid references phases(id) on delete cascade,
  type                   text not null check (type in ('task', 'milestone', 'meeting')),
  name                   text not null,
  responsible            text,
  responsible_member_id  text,
  depends_on             jsonb not null default '[]'::jsonb,
  is_critical            boolean not null default false,
  planned_start          date,
  planned_end            date,
  baseline_start         date,
  baseline_end           date,
  planned_date           date,
  baseline_date          date,
  planned_time           time,
  actual_start           date,
  actual_end             date,
  duration_days          integer,
  duration_hours         numeric,
  risk_flag              text check (risk_flag in ('none', 'warning', 'critical')),
  status                 text check (status in ('pending', 'in_progress', 'done', 'blocked', 'overdue')),
  status_override        boolean not null default false,
  "order"                integer not null default 0,
  parent_entry_id        uuid references entries(id) on delete set null,
  subtasks               jsonb not null default '[]'::jsonb,
  links                  jsonb not null default '[]'::jsonb,
  owners                 jsonb not null default '[]'::jsonb,
  hidden_from_plan        boolean not null default false,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null,
  updated_at             timestamptz,
  updated_by             uuid references auth.users(id) on delete set null
);

create index if not exists entries_project_id_idx on entries(project_id);
create index if not exists entries_phase_id_idx on entries(phase_id);
alter table entries enable row level security;

create policy "Users can manage entries of their projects"
  on entries for all
  using (exists (select 1 from projects p where p.id = entries.project_id and p.created_by = auth.uid()));

-- comments (top-level entry comments)
create table if not exists comments (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  entry_id       uuid references entries(id) on delete cascade,
  author_id      uuid references auth.users(id) on delete set null,
  author_name    text,
  author_avatar  text,
  text           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists comments_project_id_idx on comments(project_id);
create index if not exists comments_entry_id_idx on comments(entry_id);
alter table comments enable row level security;

create policy "Users can manage comments of their projects"
  on comments for all
  using (exists (select 1 from projects p where p.id = comments.project_id and p.created_by = auth.uid()));

-- risks
create table if not exists risks (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  description       text not null,
  probability       text check (probability in ('low', 'medium', 'high')),
  impact            text check (impact in ('low', 'medium', 'high')),
  score             integer,
  status            text,
  owner             text,
  due_date          date,
  linked_entry_ids  jsonb not null default '[]'::jsonb,
  action_tasks      jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz
);

create index if not exists risks_project_id_idx on risks(project_id);
alter table risks enable row level security;

create policy "Users can manage risks of their projects"
  on risks for all
  using (exists (select 1 from projects p where p.id = risks.project_id and p.created_by = auth.uid()));

-- delay_log
create table if not exists delay_log (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  entry_id        uuid references entries(id) on delete set null,
  entry_name      text,
  days            integer not null default 0,
  description     text,
  responsibility  text check (responsibility in ('internal', 'client_business', 'client_it', 'client_provider')),
  type            text check (type in ('execution', 'definition', 'planning')),
  triggered_by    text check (triggered_by in ('manual', 'cascade')),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null
);

create index if not exists delay_log_project_id_idx on delay_log(project_id);
alter table delay_log enable row level security;

create policy "Users can manage delay log of their projects"
  on delay_log for all
  using (exists (select 1 from projects p where p.id = delay_log.project_id and p.created_by = auth.uid()));

-- settings: single shared, app-wide config row
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz,
  updated_by  uuid references auth.users(id) on delete set null
);

alter table settings enable row level security;

create policy "Authenticated users can read and write app settings"
  on settings for all
  using (auth.role() = 'authenticated');
```

Then apply the diary migration (`supabase/migrations/20260430_diary.sql`), which references `projects(id)` — so it must run **after** the `projects` table above exists.

#### Google OAuth Setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project → **APIs & Services → Credentials → Create Credentials → OAuth client ID** (type: Web application).
2. Add an **Authorized redirect URI**: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`.
3. Copy the generated Client ID and Client Secret.
4. In the Supabase Dashboard: **Authentication → Providers → Google** — enable it and paste the Client ID/Secret.
5. In **Authentication → URL Configuration**, add your app's callback path to **Redirect URLs** for every environment you run: `http://localhost:5173/auth/callback` (Vite's default dev port) and `https://<your-production-domain>/auth/callback`. The app itself builds this URL as `window.location.origin + '/auth/callback'` (see `useAuthStore.signInWithGoogle`), so it must match exactly.
6. Optionally set `VITE_ALLOWED_EMAIL_DOMAIN` to restrict sign-in to a single corporate domain (enforced client-side in `AuthCallback`, not by Supabase itself).

#### Storage Buckets

One bucket: **`project-files`** (private). Its creation and policies are shipped as commented-out SQL at the bottom of `supabase/migrations/20260430_diary.sql` — uncomment and run manually, or via the Dashboard (**Storage → New bucket**, name `project-files`, **Public: off**), then apply:

```sql
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict do nothing;

create policy "Authenticated users can upload project files"
  on storage.objects for insert
  with check (bucket_id = 'project-files' and auth.role() = 'authenticated');

create policy "Authenticated users can read project files"
  on storage.objects for select
  using (bucket_id = 'project-files' and auth.role() = 'authenticated');

create policy "Authenticated users can delete their project files"
  on storage.objects for delete
  using (bucket_id = 'project-files' and auth.role() = 'authenticated');
```

## Deployment

### Vercel

1. Import the GitHub repository into a new Vercel project.
2. Set the three [environment variables](#environment-variables) (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optionally `VITE_ALLOWED_EMAIL_DOMAIN`) in **Project Settings → Environment Variables** — remember they need the `VITE_` prefix to be embedded into the client bundle by Vite at build time.
3. Build settings: Vercel auto-detects Vite; framework preset **Vite**, build command `npm run build` (or leave default), output directory `dist`.
4. `vercel.json` at the repo root contains a single SPA rewrite rule (`"/(.*)" → "/index.html"`) so that client-side routes (e.g. `/projects/:id`) resolve correctly on refresh/direct load — no further Vercel config is needed.

### Post-deployment checklist

- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (and `VITE_ALLOWED_EMAIL_DOMAIN` if used) set in Vercel for the correct environment(s)
- [ ] Supabase **Authentication → URL Configuration** updated with the production origin's `/auth/callback` redirect URL
- [ ] Google Cloud Console OAuth client's authorized redirect URI still points at the Supabase project's `/auth/v1/callback` (unaffected by which frontend domain calls it, but worth re-verifying after any Supabase project changes)
- [ ] All database migrations run against the production Supabase project (both the shipped diary migration and the reconstructed core-table SQL above)
- [ ] Supabase schema cache reloaded (**Database → API → Reload schema**, or restart the Postgres connection pool) after running new migrations, so PostgREST picks up the new tables/columns immediately

## Data Models

All types below are defined in `src/types/index.ts` unless noted; DB-facing snake_case equivalents live in `src/types/database.ts` (see [Database](#database-supabase)).

| Type | Fields | Notes / Relationships |
|---|---|---|
| `Entry` | `id`, `type` (`task`\|`milestone`\|`meeting`), `name`, `responsible`, `dependsOn: string[]`, `isCritical`, `plannedStart`/`plannedEnd` (tasks), `plannedDate` (milestones/meetings), `baselineStart`/`baselineEnd`/`baselineDate`, `actualStart`/`actualEnd`, `durationDays` (tasks), `durationHours` (meetings), `riskFlag`, `status`, `statusOverride`, `responsibleMemberId`/`responsibleMode`, `owners: EntryOwner[]`, `hiddenFromPlan`, `subtasks: Entry[]` (recursive, one level deep in practice), `comments: EntryComment[]`, `links: Link[]`, `order`, `parentEntryId` (links a "child meeting" to its owning task/milestone), audit fields | The core planning unit. `type` determines which date fields apply (start+end vs single date) and which duration unit is used. |
| `Phase` | `id`, `name`, `order`, `entries: Entry[]` | Ordered container within a `Project`. |
| `Project` | `id`, `name`, `client`, `type` (`nova_conta`\|`novo_projeto`), `pm`, `color`, `archived`, `devLead`, `devType`, `devIntegration`, `language`, `status`, `baselineSetAt`, `columnVisibility`, `csvColumnPrefs`, `reportPrefs`, `phases: Phase[]`, `risks: Risk[]`, `delayLog: DelayLogEntry[]`, `team: TeamMember[]`, `links: Link[]`, `overview`, `charter?: ProjectCharter`, `openPoints?: OpenPoint[]`, `meetings?: MeetingLog[]`, `history?: HistoryEntry[]` | Root aggregate — one row in `projects` plus all its child collections. |
| `ProjectCharter` | `sponsor`, `objectives`, `scope`, `outOfScope`, `successCriteria`, `constraints`, `assumptions`, `budget?` | Stored as a single JSONB column on `projects`. |
| `Risk` | `id`, `description`, `probability`, `impact`, `score`, `status`, `owner`, `dueDate?`, `linkedEntryIds: string[]` (→ `Entry.id`), `actionTasks: ActionTask[]` | `score` is computed client-side (probability × impact) and stored, not a generated column. |
| `ActionTask` | `id`, `description`, `responsible?`, `dueDate?`, `done` | Embedded inside `Risk.actionTasks` (JSONB — not a separate table). |
| `DelayLogEntry` | `id`, `date`, `entryId` (→ `Entry.id`), `entryName` (denormalized snapshot), `days`, `responsibility`, `type`, `description`, `comments`, `triggeredBy` (`manual`\|`cascade`) | One row per delay-log entry in the `delay_log` table. |
| `TeamMember` | `id`, `name`, `role`, `email?`, `userId?` | Embedded in `Project.team` (JSONB). |
| `OpenPoint` | `id`, `title`, `description?`, `status` (`open`\|`resolved`), `priority` (`low`\|`medium`\|`high`), `responsible?`, `dueDate?`, `resolvedAt?`/`resolvedBy?`/`resolution?`, `linkedEntryId?`, `comments: DiaryComment[]`, `attachments: FileAttachment[]`, audit fields | Own table, `open_points`. |
| `MeetingLog` | `id`, `title`, `date`, `durationMinutes?`, `location?`, `attendees?`, `objective?`, `notes?`, `linkedEntryId?`, `items: MeetingItem[]`, `comments`, `attachments`, audit fields | Own table, `meeting_logs`; `items` stored as embedded JSONB. |
| `MeetingItem` | `id`, `text`, `done`, `type` (`action`\|`decision`\|`info`), `responsible?`, `dueDate?`, `promotedToOpenPointId?`, `promotedToEntryId?` | The two `promotedTo*` fields are defined but no code path currently sets them (see Known Issues). |
| `HistoryEntry` | `id`, `event: HistoryEventType`, `title`, `detail?`, `linkedId?`, `linkedType?`, `isManualNote?`, `comments`, audit fields | Own table, `history`; `HistoryEventType` = `project_created`\|`status_changed`\|`baseline_set`\|`risk_added`\|`delay_logged`\|`member_added`\|`meeting_held`\|`open_point_resolved`\|`note` (the last two event types are defined but never emitted by any store action — see Known Issues). |
| `DiaryComment` / `EntryComment` | `id`, `author`, `text`, `createdAt` | Two structurally-identical comment shapes used in different contexts (entry comments vs. diary comments) — backed by different tables (`comments` vs `diary_comments`). |
| `FileAttachment` | `id` (= storage path), `name`, `url` (signed URL), `size?`, `uploadedAt`, `uploadedBy?` | Not a DB row — reconstructed client-side from Supabase Storage object metadata. |
| `AppSettings` | `holidays: string[]`, `holidayNames: Record<string,string>`, `templates: ProjectTemplate[]`, `templatesVersion?`, `defaultLanguage`, `dateFormat`, `workdays`, `clients: string[]`, `sidebarCollapsed?` | Split between the `settings` table (holidays/language/dateFormat/workdays/clients) and localStorage (templates/templatesVersion/sidebarCollapsed). |
| `ProjectTemplate` / `TemplatePhase` / `TemplateEntry` | Same shape as `Project`/`Phase`/`Entry` but with `nameKey?` (i18n key resolved at project-creation time) instead of fixed dates | Only two exist by default (`nova_conta`, `novo_projeto`), editable via `TemplateEditorPage`. |

## Key Business Rules

1. **Date propagation (cascade)** — editing a task's `plannedEnd` (or a milestone/meeting's `plannedDate`) walks the dependency graph forward and pushes every direct/transitive dependent to start 1 workday after its (possibly-just-shifted) predecessor ends, recomputing each dependent's own end from its stored duration. Entries with `actualEnd` already set are treated as immovable and never get cascaded into. See [Date Engine](#date-engine).
2. **Status auto-calculation** — `computeAutoStatus` derives status purely from dates: `done` if `actualEnd` is set; else `overdue` if today is past the planned end/date; else `in_progress` if today is on/after the planned start; else `pending`. This auto-status is skipped entirely if `status === 'blocked'` or if `statusOverride` is true (a manual pin) — `resetStatusOverride` clears the pin and re-derives status for "today."
3. **Baseline vs planned vs actual** — `plannedStart`/`plannedEnd`/`plannedDate` are the live, editable schedule; `baselineStart`/`baselineEnd`/`baselineDate` are a frozen snapshot taken by `setBaseline` (copied from the planned fields at that moment) used purely for variance comparison; `actualStart`/`actualEnd` record when work genuinely started/finished and, once `actualEnd` is set, the entry stops being cascaded/rescheduled. `clearBaseline` wipes the baseline fields and `project.baselineSetAt`, disabling variance display until a new baseline is set.
4. **Dependency types and cascade rules** — dependencies are untyped (a single `dependsOn: string[]` of predecessor entry IDs, always finish-to-start in effect); there's no lag/lead time, and no distinction between hard and soft dependencies. Circular dependencies are actively prevented in the UI's dependency picker (`wouldCreateCycle` in `TemplateEditorPage`, similar checks in the Plan dependency picker) and are explicitly detected and rejected during JSON import (`validateImportJson`'s DFS cycle check).
5. **Working days calculation** — governed by `settings.workdays` (`mon-fri` excludes Saturday+Sunday; `mon-sat` excludes only Sunday) and `settings.holidays` (an explicit ISO-date list); all workday math (cascade shifts, variance, duration, project totals) funnels through `businessDays.ts`'s `addWorkdays`/`workdaysBetween`.
6. **Critical path calculation** — `computeCriticalPath` finds the entry (or entries) with the maximum earliest-finish-time (measured in raw calendar days from each entry's own end date plus its predecessors', not workdays) and marks every entry on that longest chain as critical via backward traversal of `dependsOn`. This is a longest-path approximation, not a full CPM float/slack calculation.
7. **i18n: system language vs. project language** — `settings.defaultLanguage` drives the live UI; `project.language` only affects one-time template-name translation at project creation (see [i18n](#i18n)). Changing either afterward does not retranslate existing project/phase/entry names.
8. **`hiddenFromPlan` behavior** — entries flagged `hiddenFromPlan` are excluded from the Project Plan table, but still appear in that project's Kanban board (under a separate "Internal tasks" section) and in the cross-project Task Base (`/tasks`) as long as they have at least one owner — three different pages treat the same flag three different ways.
9. **Entry type differences** — `task` has a start+end range and `durationDays`; `milestone` has a single `plannedDate` and no duration; `meeting` has a single `plannedDate` plus `durationHours`, and can optionally be a "child" of a task/milestone via `parentEntryId` (rendered as a linked/nested row in the Plan table and CSV export). All three participate in the same dependency graph and cascade/critical-path logic, using whichever date field is relevant to their type.

## API Reference (Supabase)

All access goes through `@supabase/supabase-js`'s query builder (`supabase.from('<table>')...`) — no REST/GraphQL layer of its own. Reads are batched per-project-set on load; writes are per-action, mostly optimistic (see [State Management](#state-management)).

| Table | Select (with typical filters) | Insert | Update | Delete/Upsert |
|---|---|---|---|---|
| `projects` | `*` where `archived=false` (portfolio) / `archived=true` (archived list), ordered by `created_at`/`updated_at` | On create/duplicate/import | Patch on `updateProject`, team/link/charter/overview changes (`dbSyncProjectRow`), `archived` flag on archive/unarchive | Delete on `deleteProject`; upsert on `importProject` |
| `phases` | `*` where `project_id in (...)` | On `addPhase`, create/duplicate/import | `name`/`order` on `updatePhase`/`reorderPhases` | Delete on `deletePhase`; upsert on import |
| `entries` | `*` where `project_id in (...)` | On `addEntry`, create/duplicate/import | Per-row on `updateEntry`/`updateEntryStatus`/`changeEntryDate`/link changes; bulk upsert-all-rows-in-project (`dbSyncAllEntries`) after structural changes (`deleteEntry`, `moveEntryToPhase`, `recalculateStatuses`, `changeEntryDate` cascades) since subtasks are embedded per parent row | Delete on `deleteEntry`; upsert on import |
| `comments` | `*` where `project_id in (...)` | On `addComment` | — | Delete on `removeComment` |
| `risks` | `*` where `project_id in (...)` | On `addRisk`, duplicate/import | Whole-row update on `updateRisk` and any action-task change (`dbSyncRisk`, since `action_tasks` is embedded JSON) | Delete on `deleteRisk` |
| `delay_log` | `*` where `project_id in (...)` | On `addDelayLogEntry`, `changeEntryDate` (auto/cascade entries) | Field-mapped update on `updateDelayLogEntry` | Delete on `deleteDelayLogEntry` |
| `open_points` | `*` where `project_id in (...)`, ordered by `created_at desc` | On `addOpenPoint` | Partial field update on `updateOpenPoint`/`resolveOpenPoint` | Delete on `deleteOpenPoint` |
| `meeting_logs` | (loaded as part of the project's tab data, not in the initial `loadProjects` batch per the store report — verify per your build) | On `addMeetingLog` | Partial field update on `updateMeetingLog`; whole-`items`-array update on `addMeetingItem`/`updateMeetingItem`/`deleteMeetingItem` | Delete on `deleteMeetingLog` |
| `history` | — | On `addHistoryEntry` (called internally by many other actions as an audit trail) | `title`/`detail` only, on `updateHistoryEntry` | Delete on `deleteHistoryEntry` |
| `diary_comments` | — | On `addDiaryComment` | — | Delete on `deleteDiaryComment` |
| `settings` | Single row, `key='config'` | — | `upsert` (`onConflict: 'key'`) on any global settings change (`updateSettings`, `addHoliday`/`removeHoliday`, `addClient`/`removeClient`) | — |
| `profiles` | Single row by `id = auth.uid()`, on session init | — (expected to be populated by an `auth.users` trigger — see Supabase Setup) | — | — |
| Storage (`project-files`) | — | `upload()` on file attach | — | `remove()` on attachment delete; `createSignedUrl()` (7-day expiry) generated on every upload for display |

## Contributing

### Development workflow
Run `npm run dev` for the Vite dev server with HMR. `npm run build` runs `tsc` first (the project uses `strict: true` TypeScript), so type errors block the production build even though the dev server itself doesn't block on them.

### Branching strategy
No CI configuration (e.g. `.github/workflows`) or `CONTRIBUTING.md` was found in the repository, and the shared archive has no `.git` history to inspect — there is no documented branching strategy. The archive is named for a `main` branch, suggesting trunk-based development, but this is inferred, not documented.

### Running builds locally
```bash
npm install
npm run build      # tsc type-check + production build to dist/
npm run preview    # serve the dist/ build locally for a final check
```

## Roadmap

### Implemented
Portfolio (list/Kanban, filters, templates, archive, JSON backup), Project Workspace (Overview/Charter/Team tabs), Project Plan with cascading date engine + critical path + baseline/variance, Risk register with action tasks, Delay Log with manual + cascade-triggered entries and responsibility/type charts, Diary (Open Points, Meetings, History with audit trail), cross-project Task Base, per-project Kanban with an internal-tasks section, CSV/JSON export, JSON import (new + merge/replace update), branded HTML status report, Google OAuth with optional domain allowlisting, i18n (pt/en/es), configurable holidays/workdays/date-format, drag-and-drop template editor.

### In Progress
- **Carteira (Clients) and Sustentação (Incidents)** — two new top-level areas under active development: a real client registry (replacing the free-text `Project.client` field) with CS-owner history and contacts, and an incident/support-ticket entity that reuses the Entry (task) engine and the Diary's Open Points/History sub-features. Also moving the DB's row-level security model from per-creator-private to team-wide shared. See the implementation plan for the full design.
- **Meeting-item promotion** — `MeetingItem.promotedToOpenPointId`/`promotedToEntryId` fields and `promoteToOp`/`promoteToTask` translation strings exist, but no UI action in `MeetingsTab.tsx` actually creates an Open Point or Entry from a meeting item yet.
- **XLSX export** — `utils/exportXlsx.ts` is fully implemented but not called from any page; wiring it into the UI (likely alongside the existing CSV export button) is the remaining step.
- **History event coverage** — `HistoryEventType` includes `meeting_held` and `open_point_resolved`, but no store action currently calls `addHistoryEntry` with those event types (only `project_created`, `status_changed`, `baseline_set`, `risk_added`, `delay_logged`, `member_added` are ever emitted).

### Planned (v2)
- Gantt view (no Gantt-specific code found anywhere in the codebase — this is a requested addition, not a partially-built feature).
- Real PDF export for the status report — jsPDF and html2canvas are already listed as dependencies but currently unused; the report is presently HTML-only, opened via `window.open` on a Blob URL.
- Real-time multi-user sync — no `supabase.channel()`/Realtime subscriptions exist anywhere in the store; concurrent editors currently only see each other's changes after a manual reload.

## Known Issues

A repository-wide search for `TODO`/`FIXME`/`HACK` and `console.error`/`console.warn` returned **zero matches** — there are no inline TODO markers or logged errors/warnings in `src/`. The issues below were instead found by tracing actual usage of each module:

- **Routing mismatch**: `ImportJsonModal`'s "new project" import flow navigates to `` `/project/${project.id}` `` (singular) after creating a project, but the app's actual route (declared in `App.tsx`) is `/projects/:id` (plural) — this looks like it would 404 rather than land on the new project.
- **Unused XLSX export**: `utils/exportXlsx.ts` / `exportProjectXlsx` is fully implemented but not imported by any page or component — unreachable from the UI.
- **Unused dependencies**: `jspdf` and `html2canvas` are declared in `package.json` but never imported anywhere in `src/` — the "status report" is a Blob-URL HTML document opened in a new tab, not an actual generated PDF.
- **Likely-superseded components**: `src/components/plan/AddEntryModal.tsx` and `src/components/ui/DelayModal.tsx` do not appear to be imported by any currently-routed page — `EntryModal.tsx` and a locally-defined `DelayModal` inside `PlanPage.tsx` are used instead. Verify before deleting, since only current importers were checked.
- **Inconsistent optimistic-update rollback**: most `useAppStore` actions pass a `revert` callback to the internal `sync()` helper so a failed Supabase write rolls back the local optimistic state; the Diary actions (`addOpenPoint`, `updateOpenPoint`, `resolveOpenPoint`, `addMeetingLog`, `updateMeetingLog`, `addMeetingItem`, `updateMeetingItem`, `deleteMeetingItem`, `addHistoryEntry`, `updateHistoryEntry`, `addDiaryComment`, `deleteDiaryComment`) do not — a failed write there leaves stale optimistic state in the UI with only a toast as feedback.
- **Vestigial column**: `DbEntry.planned_time` is typed in `src/types/database.ts` and always written as `null` in `storeEntryToDb`, but has no corresponding field on the `Entry` type at all — dead column.
- **Placeholder generated-types file**: `src/types/supabase.ts` is a stub (`export {}`) with a comment instructing you to run `supabase gen types typescript --local` — it has not actually been generated against a live schema, and the app relies entirely on the hand-written types in `src/types/database.ts` instead.
- **Missing core-table migrations**: as detailed in [Database](#database-supabase), the repository's only migration file covers the Diary tables; `projects`, `phases`, `entries`, `comments`, `risks`, `delay_log`, `settings`, and `profiles` have no migration in-repo, so a fresh Supabase project needs the reconstructed SQL in [Supabase Setup](#supabase-setup) before the app will function.
- **No real-time collaboration**: no Supabase Realtime subscriptions exist; data is fetched once per page load/navigation, so simultaneous editors can silently overwrite each other's optimistic writes without any conflict warning.

## License

Proprietary — Ploomes OE internal tool.
