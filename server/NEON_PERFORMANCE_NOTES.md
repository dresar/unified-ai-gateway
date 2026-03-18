# Neon Performance Notes

## Tujuan
- Menjaga login dan request API tetap cepat di Vercel tanpa Redis.
- Mengalihkan optimasi ke query, index, dan agregasi di Neon/Postgres.

## Prioritas Tinggi
- Pastikan region Vercel sedekat mungkin dengan region Neon.
- Pertahankan `DB_MAX_POOL=1` atau `2` di serverless untuk menghindari connection thrash.
- Biarkan login tetap sederhana: lookup `users.email`, lalu `bcrypt.compare()`.

## Index Yang Paling Bernilai
- `public.users(email)` sudah `UNIQUE`, jadi lookup login sudah aman.
- Tambahkan index komposit bila dashboard analytics mulai berat:
  - `public.gateway_request_logs(tenant_id, api_key_id, created_at desc)`
  - `public.gateway_request_logs(tenant_id, provider, created_at desc)`
  - `public.gateway_request_logs(api_key_id, origin_domain)`
- Jika pencarian log dengan `ILIKE` sering dipakai, pertimbangkan `pg_trgm` untuk:
  - `gateway_request_logs.error_message`
  - `gateway_request_logs.origin_domain`
  - `gateway_request_logs.request_path`
  - `api_keys.name`

## Query Yang Layak Di-rollup
- `monitoring overview`
- `api key analytics`
- statistik harian/jam dari `gateway_request_logs`

Kalau volume log naik, pindahkan agregasi ini ke summary table per jam atau materialized view, lalu refresh berkala.

## Cache HTTP Yang Aman
- Shared cache hanya untuk route publik seperti `/openapi.json`.
- Route auth, dashboard, dan gateway tetap dinamis karena user-scoped atau API-key-scoped.

## Tahap Berikutnya
- Jika mode no-Redis sudah stabil tetapi gateway analytics masih berat, tambahkan summary table `gateway_request_logs_hourly`.
- Jika replay protection HMAC perlu dikembalikan, implementasikan nonce table di Neon dengan unique index dan TTL cleanup.
