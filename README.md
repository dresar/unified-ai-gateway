# Unified AI Gateway

Gateway API kinerja tinggi dengan manajemen API key terpusat, load balancing, caching berlapis, dan dukungan serverless. Dibangun dengan Hono, React, dan Tailwind CSS dalam satu paket monorepo ringan.

## Fitur Utama

- **Kinerja Ekstrem**: Target latensi ≤0,1 detik.
- **Manajemen API Key**:
  - Generator secure 256-bit dengan prefix tenant.
  - Health check berbasis log terbaru di database.
  - Kuota dan rate limiting lokal per instance.
- **Arsitektur Micro-service Berlapis**:
  - **L1 Cache**: In-memory LRU (lokal).
  - **L2 Cache**: In-memory TTL lokal per instance.
  - **L3**: HTTP cache aman untuk route publik tertentu.
  - **Circuit Breaker**: Timeout upstream dan half-open yang bisa dikonfigurasi.
  - **Consistent Hashing**: Load balancing upstream.
- **Keamanan**: JWT + HMAC Signature verification.
- **Serverless Ready**: Kompatibel dengan Node.js runtime (Lambda, Railway, dll).
- **Frontend Dashboard**: React + Shadcn UI untuk monitoring real-time.
- **Playground**: Uji coba chat AI (Google Gemini, Groq) dan upload cloud (Cloudinary, ImageKit). Tidak memakai OpenAI — hanya Gemini API dan Groq API. Model default: Gemini 2.5 Flash, Groq Llama 3.2 3B; daftar model bisa dipilih dari database.
- **Apify Test Page**: Uji `verify`, list actors/tasks, run actor/task, status run, dan dataset items lewat provider `apify`.

## Prasyarat

- Node.js v18+
- PostgreSQL
## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Konfigurasi Environment**
    Buat file `.env` di root project:
    ```env
    PORT=8787
    DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
    JWT_SECRET=rahasia_super_panjang_minimal_32_karakter
    ```
    Untuk production serverless (Vercel/Lambda), gunakan template [`.env.production.example`](.env.production.example). Mode default sekarang memakai cache dan rate limit lokal per instance agar cold start di Vercel lebih ringan.

3.  **Migrasi Database**
    Jalankan script migrasi untuk membuat tabel yang diperlukan:
    ```bash
    npm run migrate
    ```

## Menjalankan Aplikasi

### Development
Menjalankan server backend dan frontend (Vite) secara bersamaan (perlu 2 terminal atau concurrent, saat ini terpisah):

Terminal 1 (Server):
```bash
npm run dev:server
```

Terminal 2 (Frontend):
```bash
npm run dev
```
Frontend akan berjalan di `http://localhost:8080` dan proxy ke backend di `http://localhost:8787`.
Untuk uji Apify dari dashboard, simpan dulu credential `api_token` di halaman `Credentials`, lalu buat Gateway API key dengan provider `apify`, kemudian buka halaman `Test Apify`.

### Production
Build frontend dan jalankan server:
```bash
npm run build
npm start
```

### Vercel Production
- Frontend statis dibangun ke `dist`, lalu route `/api/*`, `/gateway/*`, dan `/healthz` diarahkan ke `api/index.js` lewat `vercel.json`.
- Set environment variables di dashboard Vercel berdasarkan `.env.production.example`.
- Gunakan region Vercel yang dekat dengan region database. Jika database Neon Anda berada di `ap-southeast-1`, pilih region deploy yang sedekat mungkin untuk menekan latency.
- `VITE_ENABLE_REALTIME_ALERTS=false` disarankan di Vercel karena WebSocket tidak menjadi jalur realtime utama pada serverless runtime.
- `build:vercel` sekarang hanya membangun frontend. Jalankan `npm run migrate` secara terpisah saat menyiapkan atau memperbarui schema production.

## API Key Management & Troubleshooting

### Rotasi Key Otomatis
Pada mode serverless ringan, auto-rotation lintas instance dinonaktifkan sementara.
- Sistem tetap mencatat anomali dan membuat alert.
- Rotasi manual dari dashboard tetap tersedia.

### Troubleshooting
- **Error "Email sudah terdaftar" saat register**: Cek tabel `users`, email harus unik.
- **Database Error**: Pastikan PostgreSQL berjalan dan user memiliki hak akses `CREATE TABLE` untuk migrasi.
- **CORS Error**: Backend sudah dikonfigurasi `cors()`, pastikan frontend mengakses via proxy atau URL yang benar.
- **Memory Usage Tinggi**: Cek konfigurasi `DB_MAX_POOL` (turunkan ke 1-2 untuk serverless) dan L1 Cache size (default 1000 item).

## Deployment Serverless
Aplikasi ini dirancang "stateless" (state di DB; cache in-memory).
- **AWS Lambda / Vercel**: Gunakan adapter Hono untuk serverless.
- **Railway / Render**: Deploy sebagai Node.js service biasa (`npm start`). Set `DB_MAX_POOL=5` atau lebih rendah sesuai resource.
