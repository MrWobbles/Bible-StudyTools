-- Supabase schema for Bible Study Tools
-- Run this in the Supabase SQL editor for a fresh project.

create table if not exists public.bst_classes (
  class_id text primary key,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  data jsonb not null default '{}'::jsonb
);

create index if not exists bst_classes_sort_order_idx
  on public.bst_classes (sort_order, class_id);

create table if not exists public.bst_lesson_plans (
  plan_id text primary key,
  class_ids text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  data jsonb not null default '{}'::jsonb
);

create index if not exists bst_lesson_plans_sort_order_idx
  on public.bst_lesson_plans (sort_order, plan_id);

create index if not exists bst_lesson_plans_class_ids_gin_idx
  on public.bst_lesson_plans using gin (class_ids);

create table if not exists public.bst_notes (
  note_id text primary key,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  data jsonb not null default '{}'::jsonb
);

create index if not exists bst_notes_sort_order_idx
  on public.bst_notes (sort_order, note_id);

create table if not exists public.bst_app_data_history (
  id bigint generated always as identity primary key,
  doc_id text not null,
  reason text not null default 'save',
  schema_version integer not null default 1,
  recorded_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists bst_app_data_history_doc_id_recorded_at_idx
  on public.bst_app_data_history (doc_id, recorded_at desc);

create table if not exists public.bst_user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  email text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  constraint bst_user_profiles_username_lower_chk check (username = lower(username)),
  constraint bst_user_profiles_email_lower_chk check (email = lower(email))
);

create index if not exists bst_user_profiles_created_at_idx
  on public.bst_user_profiles (created_at desc);

create table if not exists public.bst_signup_invites (
  id bigint generated always as identity primary key,
  invite_code text not null unique,
  email text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  used_at timestamptz,
  used_by_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  constraint bst_signup_invites_email_lower_chk check (email is null or email = lower(email))
);

create index if not exists bst_signup_invites_email_idx
  on public.bst_signup_invites (email);

create index if not exists bst_signup_invites_unused_idx
  on public.bst_signup_invites (used_at, expires_at);

create table if not exists public.bst_signup_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default timezone('utc', now()),
  status text not null default 'pending',
  username text not null,
  email text not null,
  display_name text,
  message text,
  source_ip text,
  invite_code text,
  approved_at timestamptz,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  constraint bst_signup_requests_username_lower_chk check (username = lower(username)),
  constraint bst_signup_requests_email_lower_chk check (email = lower(email))
);

alter table public.bst_signup_requests
  add column if not exists invite_code text;

alter table public.bst_signup_requests
  add column if not exists approved_at timestamptz;

alter table public.bst_signup_requests
  add column if not exists approved_by_user_id uuid references auth.users (id) on delete set null;

create index if not exists bst_signup_requests_status_requested_at_idx
  on public.bst_signup_requests (status, requested_at desc);

create index if not exists bst_signup_requests_username_idx
  on public.bst_signup_requests (username);

create index if not exists bst_signup_requests_email_idx
  on public.bst_signup_requests (email);

create index if not exists bst_signup_requests_approved_at_idx
  on public.bst_signup_requests (approved_at desc);

alter table public.bst_classes enable row level security;
alter table public.bst_lesson_plans enable row level security;
alter table public.bst_notes enable row level security;
alter table public.bst_app_data_history enable row level security;
alter table public.bst_user_profiles enable row level security;
alter table public.bst_signup_invites enable row level security;
alter table public.bst_signup_requests enable row level security;

alter table public.bst_classes force row level security;
alter table public.bst_lesson_plans force row level security;
alter table public.bst_notes force row level security;
alter table public.bst_app_data_history force row level security;
alter table public.bst_user_profiles force row level security;
alter table public.bst_signup_invites force row level security;
alter table public.bst_signup_requests force row level security;
