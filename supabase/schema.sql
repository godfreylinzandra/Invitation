-- Run this in Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.wedding_photos (
  id uuid primary key default gen_random_uuid(),
  file_name text not null unique,
  public_url text not null,
  uploaded_by text not null default 'guest',
  created_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert on public.wedding_photos to anon, authenticated;

alter table public.wedding_photos enable row level security;

drop policy if exists "Allow public read wedding_photos" on public.wedding_photos;
create policy "Allow public read wedding_photos"
on public.wedding_photos
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public insert wedding_photos" on public.wedding_photos;
create policy "Allow public insert wedding_photos"
on public.wedding_photos
for insert
to anon, authenticated
with check (true);

insert into storage.buckets (id, name, public)
values ('wedding-photos', 'wedding-photos', true)
on conflict (id) do nothing;

drop policy if exists "Allow public upload wedding photos" on storage.objects;
create policy "Allow public upload wedding photos"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'wedding-photos');

drop policy if exists "Allow public read wedding photos" on storage.objects;
create policy "Allow public read wedding photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'wedding-photos');
