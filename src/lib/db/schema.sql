-- =====================================================================
-- Wahlburgers Academy — PostgreSQL schema
-- Normalized enterprise LMS schema. Runs on PostgreSQL 15+ (the prototype
-- executes it against an embedded PGlite Postgres engine; the same DDL runs
-- unchanged against a hosted Postgres / Supabase instance).
-- =====================================================================

-- ---------- Organization hierarchy -----------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_text text default 'Wahlburgers Academy',
  created_at timestamptz not null default now()
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  unique (organization_id, code)
);

create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  unique (organization_id, code)
);

create table if not exists franchise_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  ownership_type text not null default 'Franchise',   -- Franchise | Corporate | Joint Venture
  principal_name text,
  contact_email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  unique (organization_id, code)
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid references brands(id),
  franchise_group_id uuid references franchise_groups(id),
  region_id uuid references regions(id),
  store_number text not null,
  name text not null,
  ownership_type text not null default 'Franchise',
  address_line1 text,
  city text,
  state text,
  postal_code text,
  phone text,
  timezone text default 'America/New_York',
  status text not null default 'active',              -- active | closed | pre-opening
  opened_on date,
  gm_user_id uuid,
  fbp_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, store_number)
);
create index if not exists idx_locations_fg on locations(franchise_group_id);
create index if not exists idx_locations_region on locations(region_id);

-- ---------- Roles, permissions, users --------------------------------
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  scope_level text not null default 'self',   -- self|location|multi_location|franchise_group|region|organization
  is_custom boolean not null default false,
  is_learner_role boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  category text not null,
  description text
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  username text not null,
  password_hash text,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  phone text,
  avatar_color text default '#0e1f38',
  avatar_url text,
  status text not null default 'active',    -- active|inactive|deactivated|leave_of_absence|terminated|invited
  last_login_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text,
  deactivation_trigger text,                -- manual | inactivity_rule | termination_import
  reactivated_at timestamptz,
  reactivated_by uuid,
  flagged_inactive_at timestamptz,
  source_system text not null default 'Wahlburgers Academy',
  source_record_id text,
  migration_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_users_email on users(lower(email));
create unique index if not exists idx_users_username on users(lower(username));
create index if not exists idx_users_status on users(status);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  employee_id text not null,
  primary_location_id uuid references locations(id),
  franchise_group_id uuid references franchise_groups(id),
  department_id uuid references departments(id),
  role_id uuid references roles(id),
  position_title text,
  manager_user_id uuid references users(id),
  hire_date date,
  termination_date date,
  employment_type text default 'Hourly',   -- Hourly | Salaried | Corporate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id)
);
create index if not exists idx_employees_location on employees(primary_location_id);
create index if not exists idx_employees_role on employees(role_id);
create index if not exists idx_employees_manager on employees(manager_user_id);

create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  is_primary boolean not null default true,
  primary key (user_id, role_id)
);

-- Location-level access grants (multi-unit operators, GMs, trainers).
create table if not exists user_locations (
  user_id uuid not null references users(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  access_type text not null default 'assigned',  -- primary | assigned | portfolio
  primary key (user_id, location_id)
);

-- Broader access grants (region / franchise group / whole organization).
create table if not exists user_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scope_type text not null,      -- organization | region | franchise_group | location | department | self
  scope_id uuid,
  is_read_only boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_scopes_user on user_scopes(user_id);

create table if not exists user_permission_overrides (
  user_id uuid not null references users(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  granted boolean not null default true,
  primary key (user_id, permission_id)
);

create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  theme text not null default 'system',      -- light | dark | system
  density text not null default 'comfortable',
  email_notifications boolean not null default true,
  digest_frequency text not null default 'weekly',
  dashboard_layout jsonb
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  revoked_at timestamptz,
  impersonated_by uuid references users(id)
);
create index if not exists idx_sessions_user on sessions(user_id);

-- ---------- Content --------------------------------------------------
create table if not exists course_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  color text default '#1e5fbf',
  sort_order int default 100,
  unique (organization_id, slug)
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  asset_type text not null,      -- scorm|video|pdf|document|presentation|image|html|link|checklist|policy|sop|job_aid|guide
  category text,
  tags text[] default '{}',
  version int not null default 1,
  file_name text,
  file_path text,
  external_url text,
  mime_type text,
  file_size bigint default 0,
  uploaded_by uuid references users(id),
  status text not null default 'active',   -- active | draft | archived
  is_archived boolean not null default false,
  is_resource boolean not null default false,  -- surfaced in the Resource Library
  requires_acknowledgment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_assets_type on assets(asset_type);

create table if not exists asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  version int not null,
  file_name text,
  file_path text,
  file_size bigint default 0,
  notes text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (asset_id, version)
);

create table if not exists scorm_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  identifier text,
  scorm_version text not null default '1.2',      -- 1.2 | 2004
  launch_file text not null,
  extract_path text not null,
  manifest_xml text,
  mastery_score numeric,
  file_size bigint default 0,
  file_name text,
  status text not null default 'active',
  version int not null default 1,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists scorm_versions (
  id uuid primary key default gen_random_uuid(),
  scorm_package_id uuid not null references scorm_packages(id) on delete cascade,
  version int not null,
  launch_file text not null,
  extract_path text not null,
  file_size bigint default 0,
  notes text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (scorm_package_id, version)
);

create table if not exists certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  validity_months int default 12,
  passing_score numeric default 80,
  requires_manager_approval boolean not null default false,
  renewal_requirements text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  objectives text[] default '{}',
  category_id uuid references course_categories(id),
  course_type text not null default 'blended',  -- scorm|video|document|blended|assessment|ilt
  thumbnail_color text default '#0e1f38',
  thumbnail_url text,
  estimated_minutes int default 30,
  is_required_default boolean not null default false,
  passing_score numeric default 80,
  status text not null default 'draft',         -- draft|scheduled|published|archived
  owner_user_id uuid references users(id),
  certification_id uuid references certifications(id),
  current_version int not null default 1,
  rating_avg numeric default 0,
  rating_count int default 0,
  completion_count int default 0,
  tags text[] default '{}',
  prerequisites uuid[] default '{}',
  source_system text not null default 'Wahlburgers Academy',
  source_record_id text,
  migration_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (organization_id, code)
);
create index if not exists idx_courses_status on courses(status);
create index if not exists idx_courses_category on courses(category_id);

create table if not exists course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  version_number int not null,
  status text not null default 'draft',      -- draft|scheduled|published|archived
  change_notes text,
  author_user_id uuid references users(id),
  requires_retraining boolean not null default false,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, version_number)
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  passing_score numeric not null default 80,
  attempt_limit int default 3,
  time_limit_minutes int,
  randomize_questions boolean not null default true,
  questions_per_attempt int,
  show_correct_answers boolean not null default true,
  retake_delay_hours int default 0,
  status text not null default 'active',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  position int not null default 1,
  question_type text not null default 'single', -- single|multiple|true_false|matching|ordering|scenario|image
  prompt text not null,
  image_url text,
  scenario_text text,
  points numeric not null default 1,
  pool_tag text,
  feedback_correct text,
  feedback_incorrect text
);
create index if not exists idx_questions_assessment on questions(assessment_id);

create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  position int not null default 1,
  label text not null,
  is_correct boolean not null default false,
  match_key text
);
create index if not exists idx_question_options_q on question_options(question_id);

create table if not exists course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  course_version int not null default 1,
  title text not null,
  description text,
  module_type text not null,   -- scorm|video|pdf|document|presentation|image|text|link|assessment|checklist|policy|manager_validation|ilt|virtual
  position int not null default 1,
  asset_id uuid references assets(id),
  scorm_package_id uuid references scorm_packages(id),
  assessment_id uuid references assessments(id),
  content_text text,
  external_url text,
  is_required boolean not null default true,
  min_seconds int default 0,
  passing_score numeric,
  attempt_limit int,
  requires_manager_validation boolean not null default false,
  sequence_required boolean not null default false,
  prerequisite_module_id uuid,
  completion_rule text default 'view',   -- view|score|acknowledge|attend|validate
  created_at timestamptz not null default now()
);
create index if not exists idx_modules_course on course_modules(course_id, course_version);

create table if not exists learning_paths (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  category text,
  status text not null default 'published',
  certification_id uuid references certifications(id),
  color text default '#1e5fbf',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists learning_path_items (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references learning_paths(id) on delete cascade,
  position int not null default 1,
  item_type text not null default 'course',  -- course|assessment|certification|manager_validation|live_session|document
  course_id uuid references courses(id),
  assessment_id uuid references assessments(id),
  certification_id uuid references certifications(id),
  asset_id uuid references assets(id),
  title text,
  is_required boolean not null default true
);
create index if not exists idx_lp_items on learning_path_items(learning_path_id);

-- ---------- Campaigns, assignments, enrollments ----------------------
create table if not exists training_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  banner_color text default '#c8102e',
  launch_at timestamptz,
  due_at timestamptz,
  status text not null default 'active',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists campaign_courses (
  campaign_id uuid not null references training_campaigns(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  primary key (campaign_id, course_id)
);

create table if not exists assignment_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  trigger_event text not null default 'nightly',  -- on_create | on_transfer | on_role_change | nightly
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  last_run_at timestamptz,
  matches_count int not null default 0
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  item_type text not null default 'course',  -- course | learning_path
  course_id uuid references courses(id),
  learning_path_id uuid references learning_paths(id),
  priority text not null default 'normal',   -- low|normal|high|critical
  is_required boolean not null default true,
  assigned_by uuid references users(id),
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  grace_period_days int default 0,
  recurrence text default 'none',            -- none|monthly|quarterly|annual
  reminder_cadence_days int default 7,
  status text not null default 'draft',      -- draft|published|archived
  campaign_id uuid references training_campaigns(id),
  rule_id uuid references assignment_rules(id),
  estimated_population int default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists assignment_targets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  target_type text not null,   -- user|role|department|location|franchise_group|region|organization|new_hire
  target_id uuid
);
create index if not exists idx_assignment_targets on assignment_targets(assignment_id);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  course_title text,                          -- retained for legacy rows with no catalog match
  course_version int default 1,
  assignment_id uuid references assignments(id) on delete set null,
  learning_path_id uuid references learning_paths(id) on delete set null,
  status text not null default 'not_started', -- not_started|in_progress|completed|failed|waived
  is_required boolean not null default true,
  priority text default 'normal',
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  score numeric,
  passing_score numeric,
  attempts int not null default 0,
  duration_seconds int not null default 0,
  certification_id uuid references certifications(id),
  expires_at timestamptz,
  manager_validation_status text,             -- meets_standard|needs_coaching|reassessment_required
  manager_validated_by uuid references users(id),
  manager_validated_at timestamptz,
  manager_notes text,
  manager_evidence_url text,          -- photo captured during a practical skill check
  last_activity_at timestamptz,
  source_system text not null default 'Wahlburgers Academy',
  source_record_id text,
  migration_batch_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_enrollments_user on enrollments(user_id);
create index if not exists idx_enrollments_course on enrollments(course_id);
create index if not exists idx_enrollments_status on enrollments(status);
create index if not exists idx_enrollments_due on enrollments(due_at);
create index if not exists idx_enrollments_source on enrollments(source_system);
create unique index if not exists idx_enrollments_unique_active
  on enrollments(user_id, course_id, course_version, assignment_id)
  where assignment_id is not null;

create table if not exists module_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  module_id uuid not null references course_modules(id) on delete cascade,
  status text not null default 'not_started',
  score numeric,
  seconds_spent int not null default 0,
  completed_at timestamptz,
  data jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, module_id)
);

-- Raw legacy completion rows (kept for audit even when they match a catalog course).
create table if not exists historical_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  employee_ref text,
  course_id uuid references courses(id) on delete set null,
  course_ref text,
  course_version text,
  assigned_date date,
  start_date date,
  completion_date date,
  completion_status text,
  score numeric,
  passing_score numeric,
  attempts int,
  duration_minutes int,
  certification_name text,
  expiration_date date,
  source_system text not null default 'Legacy LMS',
  source_record_id text,
  migration_batch_id uuid,
  enrollment_id uuid references enrollments(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hist_user on historical_completions(user_id);

create table if not exists assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references assessments(id) on delete set null,
  assessment_title text,
  user_id uuid not null references users(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete set null,
  module_id uuid references course_modules(id) on delete set null,
  attempt_number int not null default 1,
  score numeric,
  passed boolean,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds int default 0,
  answers jsonb default '{}'::jsonb,
  source_system text not null default 'Wahlburgers Academy',
  migration_batch_id uuid
);
create index if not exists idx_attempts_user on assessment_attempts(user_id);

create table if not exists user_certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  certification_id uuid references certifications(id) on delete set null,
  certification_name text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active',   -- active|expired|revoked|pending_approval
  certificate_number text,
  issued_by uuid references users(id),
  source_system text not null default 'Wahlburgers Academy',
  source_record_id text,
  migration_batch_id uuid
);
create index if not exists idx_usercert_user on user_certifications(user_id);
create index if not exists idx_usercert_expiry on user_certifications(expires_at);

create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  criteria text,
  icon text default 'award',
  color text default '#e0a33c',
  expires_months int
);

create table if not exists user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  badge_id uuid not null references badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,
  unique (user_id, badge_id)
);

create table if not exists learning_path_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  learning_path_id uuid not null references learning_paths(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  progress numeric not null default 0,
  completed_at timestamptz,
  status text not null default 'in_progress',
  source_system text not null default 'Wahlburgers Academy',
  migration_batch_id uuid,
  unique (user_id, learning_path_id)
);

-- ---------- Calendar / instructor-led training ------------------------
create table if not exists training_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'ilt',  -- ilt|virtual|orientation|certification|manager_training|corporate|workshop|deadline|training_block
  instructor_user_id uuid references users(id),
  location_id uuid references locations(id),
  virtual_link text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int,
  materials text,
  course_id uuid references courses(id),
  learning_path_id uuid references learning_paths(id),
  learner_user_id uuid references users(id),      -- set for protected store training blocks
  status text not null default 'scheduled',       -- scheduled|completed|canceled
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_events_time on training_events(starts_at);
create index if not exists idx_events_location on training_events(location_id);

create table if not exists training_attendees (
  id uuid primary key default gen_random_uuid(),
  training_event_id uuid not null references training_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'registered',  -- registered|attended|no_show|canceled|completed
  checked_in_at timestamptz,
  notes text,
  unique (training_event_id, user_id)
);

-- ---------- Engagement -----------------------------------------------
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  post_type text not null default 'tip',  -- announcement|new_training|recognition|tip|best_practice|photo|video|celebration|training_update
  title text,
  body text not null,
  image_url text,
  link_url text,
  audience_type text not null default 'organization',
  audience_id uuid,
  is_pinned boolean not null default false,
  status text not null default 'published',  -- published|hidden
  created_at timestamptz not null default now()
);
create index if not exists idx_posts_created on social_posts(created_at desc);

create table if not exists social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references social_posts(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  body text not null,
  status text not null default 'published',
  created_at timestamptz not null default now()
);

create table if not exists social_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references social_posts(id) on delete cascade,
  comment_id uuid references social_comments(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  reaction_type text not null default 'like',  -- like|celebrate|helpful
  created_at timestamptz not null default now(),
  unique (post_id, user_id, reaction_type)
);

create table if not exists social_bookmarks (
  post_id uuid not null references social_posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists course_reviews (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete set null,
  rating int not null,
  useful int,
  easy_to_understand int,
  relevant int,
  more_confident int,
  comments text,
  created_at timestamptz not null default now()
);
create index if not exists idx_reviews_course on course_reviews(course_id);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  message text not null,
  image_url text,
  link_url text,
  audience_type text not null default 'organization',
  audience_id uuid,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  is_pinned boolean not null default false,
  requires_acknowledgment boolean not null default false,
  status text not null default 'published',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists acknowledgments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  entity_type text not null,   -- announcement | asset | policy
  entity_id uuid not null,
  entity_version int default 1,
  statement text,
  acknowledged_at timestamptz not null default now(),
  ip_address text,
  unique (user_id, entity_type, entity_id, entity_version)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  channel text not null default 'in_app',  -- in_app | email | sms | push
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, is_read);

-- ---------- Operations: imports, migration, audit, reports ------------
create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  import_type text not null,           -- employees | courses | assignments
  file_name text,
  status text not null default 'pending',
  total_rows int default 0,
  success_rows int default 0,
  error_rows int default 0,
  warning_rows int default 0,
  mapping jsonb default '{}'::jsonb,
  options jsonb default '{}'::jsonb,
  batch_id uuid default gen_random_uuid(),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists migrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_system text not null default 'Legacy LMS',
  data_type text not null,             -- employees|courses|historical_training|assessments|certifications|learning_paths
  status text not null default 'pending', -- pending|validated|completed|failed
  file_name text,
  total_records int default 0,
  imported int default 0,
  skipped int default 0,
  failed int default 0,
  warnings int default 0,
  mapping jsonb default '{}'::jsonb,
  summary jsonb default '{}'::jsonb,
  batch_id uuid not null default gen_random_uuid(),
  created_by uuid references users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists migration_records (
  id uuid primary key default gen_random_uuid(),
  migration_id uuid not null references migrations(id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  status text not null,                -- imported|skipped|failed|warning
  message text,
  entity_type text,
  entity_id uuid,
  resolution text
);
create index if not exists idx_migration_records on migration_records(migration_id, status);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references users(id) on delete set null,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id uuid,
  entity_label text,
  previous_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  location_id uuid references locations(id)
);
create index if not exists idx_audit_time on audit_logs(occurred_at desc);
create index if not exists idx_audit_actor on audit_logs(actor_user_id);

create table if not exists saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  report_key text not null,
  config jsonb not null default '{}'::jsonb,
  owner_user_id uuid references users(id),
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  report_key text not null,
  saved_report_id uuid references saved_reports(id) on delete set null,
  frequency text not null default 'weekly',  -- daily|weekly|monthly
  day_of_week int default 1,
  day_of_month int default 1,
  hour int default 7,
  recipients text[] not null default '{}',
  format text not null default 'csv',
  filters jsonb default '{}'::jsonb,
  is_active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- ---------- Reporting views ------------------------------------------
create or replace view v_people as
select
  u.id                as user_id,
  u.organization_id,
  u.email,
  u.username,
  u.first_name,
  u.last_name,
  coalesce(u.preferred_name, u.first_name) as display_first_name,
  coalesce(u.preferred_name, u.first_name) || ' ' || u.last_name as full_name,
  u.status,
  u.last_login_at,
  u.avatar_color,
  u.avatar_url,
  u.deactivated_at,
  u.source_system,
  e.id                as employee_row_id,
  e.employee_id,
  e.position_title,
  e.hire_date,
  e.termination_date,
  e.employment_type,
  e.manager_user_id,
  e.primary_location_id,
  l.name              as location_name,
  l.store_number,
  l.city, l.state,
  l.status            as location_status,
  fg.id               as franchise_group_id,
  fg.name             as franchise_group_name,
  r.id                as region_id,
  r.name              as region_name,
  d.id                as department_id,
  d.name              as department_name,
  ro.id               as role_id,
  ro.name             as role_name,
  ro.code             as role_code,
  ro.scope_level
from users u
join employees e on e.user_id = u.id
left join locations l on l.id = e.primary_location_id
left join franchise_groups fg on fg.id = coalesce(e.franchise_group_id, l.franchise_group_id)
left join regions r on r.id = l.region_id
left join departments d on d.id = e.department_id
left join roles ro on ro.id = e.role_id;

-- Unified transcript: Wahlburgers Academy records and migrated legacy records
-- live in the same stream, distinguished only by source_system.
create or replace view v_transcript as
select
  en.id,
  en.user_id,
  coalesce(c.title, en.course_title, 'Untitled training') as course_title,
  c.id            as course_id,
  c.code          as course_code,
  en.course_version,
  en.assigned_at,
  en.started_at,
  en.completed_at,
  en.status,
  en.score,
  en.passing_score,
  en.attempts,
  en.duration_seconds,
  en.certification_id,
  en.expires_at,
  en.source_system,
  en.is_required,
  en.due_at,
  cat.name        as category_name
from enrollments en
left join courses c on c.id = en.course_id
left join course_categories cat on cat.id = c.category_id;
