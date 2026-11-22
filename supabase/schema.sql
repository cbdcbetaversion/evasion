-- ÉVASION · Supabase Schema (profiles table + evasion-media public Storage bucket + RLS)
-- À exécuter dans Supabase Dashboard -> SQL Editor

-- 1. Table profiles (ne jamais écraser les données existantes à la reconnexion)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text,
  avatar_url text,
  bio text,
  is_verified boolean not null default false,
  profile_music jsonb,
  universe_media jsonb not null default '[]'::jsonb,
  active_flame jsonb,
  evasion_user_id text,
  profile_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2. Buckets Supabase Storage publics ('evasion' et 'evasion-media') pour avatars, photos, vidéos (1 min max), audios (1 min max) et fichiers
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('evasion', 'evasion', true, 20971520),
  ('evasion-media', 'evasion-media', true, 20971520)
on conflict (id) do update
set public = true,
    file_size_limit = 20971520;

drop policy if exists "Public read access on evasion" on storage.objects;
create policy "Public read access on evasion"
  on storage.objects for select
  using (bucket_id in ('evasion', 'evasion-media'));

drop policy if exists "Authenticated upload on evasion" on storage.objects;
create policy "Authenticated upload on evasion"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('evasion', 'evasion-media'));

drop policy if exists "Owners can update their files on evasion" on storage.objects;
create policy "Owners can update their files on evasion"
  on storage.objects for update
  to authenticated
  using (bucket_id in ('evasion', 'evasion-media') and auth.uid() = owner);

drop policy if exists "Owners can delete their files on evasion" on storage.objects;
create policy "Owners can delete their files on evasion"
  on storage.objects for delete
  to authenticated
  using (bucket_id in ('evasion', 'evasion-media') and auth.uid() = owner);
