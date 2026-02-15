# Supabase + Netlify Setup

## 1. Create Supabase project
1. Open Supabase and create a new project.
2. Go to SQL Editor.
3. Run `supabase/schema.sql`.

## 2. Get Supabase keys
From Supabase Project Settings -> API:
- `Project URL` -> use as `SUPABASE_URL`
- `anon public` key -> use as `SUPABASE_ANON_KEY`

## 3. Create Netlify site from this repo/folder
This project already includes:
- `netlify.toml` (`publish = "docs"`, `functions = "netlify/functions"`)
- `netlify/functions/public-config.js`

## 4. Add Netlify environment variables
In Netlify Site settings -> Environment variables, add:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_BUCKET` = `wedding-photos`

## 5. Deploy
Redeploy the site in Netlify.

The frontend will fetch public config from:
- `/.netlify/functions/public-config`

Then it will:
- upload photos to Supabase Storage bucket `wedding-photos`
- store metadata in table `public.wedding_photos`
- load gallery from `public.wedding_photos` (fallback to storage list if needed)

## Troubleshooting Upload Failed
If upload says `Upload failed`, rerun `supabase/schema.sql` in Supabase SQL Editor to ensure policies and grants are present.
