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
grant select, insert, delete on public.wedding_photos to anon, authenticated;

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

drop policy if exists "Allow public delete wedding_photos" on public.wedding_photos;
create policy "Allow public delete wedding_photos"
on public.wedding_photos
for delete
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('wedding-photos', 'wedding-photos', true)
on conflict (id) do nothing;

update storage.buckets
set public = true
where id = 'wedding-photos';

grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

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

drop policy if exists "Allow public update wedding photos" on storage.objects;
create policy "Allow public update wedding photos"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'wedding-photos')
with check (bucket_id = 'wedding-photos');

drop policy if exists "Allow public delete wedding photos" on storage.objects;
create policy "Allow public delete wedding photos"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'wedding-photos');
