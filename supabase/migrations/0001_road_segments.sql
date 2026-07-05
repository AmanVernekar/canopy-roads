-- Canopy v2 schema — road segments with PostGIS.
-- Paste into the NEW Supabase project's SQL editor and Run. Idempotent.

create extension if not exists postgis;

create table if not exists public.road_segments (
  segment_id text primary key,
  os_link_id text not null,
  usrn text,
  street_name text,
  road_number text,
  road_class text,
  area_slug text not null,
  length_m numeric,
  geom geometry(LineString, 4326) not null,

  -- flood axis (EA RoFSW / NaFRA2, indicative)
  extent_high_pct numeric,
  extent_medium_pct numeric,
  extent_low_pct numeric,
  depth_03_pct numeric,
  depth_max_m numeric,
  extent_2050s_pct numeric,
  flood_score numeric,

  -- heat axis (Tier 1)
  heat_lst_mean numeric,
  heat_utci_mean numeric,
  canopy_pct numeric,
  impervious_pct numeric,
  heat_score numeric,

  -- recommendation
  recommended_intervention text,
  recommendation_rationale text,
  recommendation_source text,

  updated_at timestamptz not null default now()
);

create index if not exists road_segments_geom_idx
  on public.road_segments using gist (geom);
create index if not exists road_segments_area_idx
  on public.road_segments (area_slug, flood_score desc);

alter table public.road_segments enable row level security;

drop policy if exists "segments read all" on public.road_segments;
create policy "segments read all" on public.road_segments for select using (true);

-- Per-session saved analyses (agent runs, Tier 1+). Mirrors v1's pattern.
create table if not exists public.segment_analyses (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  segment_id text not null references public.road_segments(segment_id),
  messages jsonb not null,
  recommendation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, segment_id)
);

alter table public.segment_analyses enable row level security;

drop policy if exists "analyses read all" on public.segment_analyses;
create policy "analyses read all" on public.segment_analyses for select using (true);
drop policy if exists "analyses write all" on public.segment_analyses;
create policy "analyses write all" on public.segment_analyses for insert with check (true);
drop policy if exists "analyses update all" on public.segment_analyses;
create policy "analyses update all" on public.segment_analyses for update using (true) with check (true);
