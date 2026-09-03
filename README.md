# WebStreaming

a streaming site

## Features

lol

## Railway environment

Set these in Railway variables before deploying:

- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TMDB_KEY`
- `SESSION_SECRET`
- `CORS_ORIGINS`
- `PUBLIC_URL`

If the homepage says metadata is unavailable, `TMDB_KEY` is missing or invalid in Railway.
If the browser says CORS origin is not allowed, set `PUBLIC_URL` to your site URL or add that origin to `CORS_ORIGINS`.
Password reset emails use `PUBLIC_URL` as the Supabase redirect target.

## Notes

this project is designed for personal use.
