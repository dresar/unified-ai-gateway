import "dotenv/config";
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const { Pool } = pg;

if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_SEED !== "true") {
  console.error("Seeding hanya diizinkan untuk environment development dengan ENABLE_DEV_SEED=true.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: true } : undefined,
});

const hashApiKey = (plain) => createHash("sha256").update(plain).digest("hex");

const main = async () => {
  console.log("Seeding database...");
  const client = await pool.connect();
    try {
      await client.query("BEGIN");
  
      // 1. Create User (Admin)
      const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
      const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const hmacSecret = randomBytes(32).toString("hex");
      console.log(`Creating user: ${email}`);
      const { rows: userRows } = await client.query(
        `INSERT INTO public.users (email, password_hash, display_name, hmac_secret) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, display_name = $3, hmac_secret = COALESCE(public.users.hmac_secret, EXCLUDED.hmac_secret)
         RETURNING id`,
        [email, passwordHash, "Admin User", hmacSecret]
      );
      const userId = userRows[0].id;
  
      // 2. Create API Key
      const apiKey = process.env.SEED_GATEWAY_API_KEY ?? "dev_apikey_change_me";
      const keyHash = hashApiKey(apiKey);
      
      console.log("Creating development gateway API key");
      await client.query(
        `INSERT INTO public.api_keys (tenant_id, key_hash, status, quota_per_minute)
         VALUES ($1, $2, 'active', 1000)
         ON CONFLICT (key_hash) DO NOTHING`,
        [userId, keyHash]
      );
  
      // 3. Create Credentials (dummy; API key nyata diisi lewat halaman Credentials di dashboard)
      console.log("Creating dummy credentials...");
      const credentials = [
        { name: "gemini", type: "ai", creds: { api_key: "dummy_gemini_key" } },
        { name: "groq", type: "ai", creds: { api_key: "dummy_groq_key" } },
        { name: "imagekit", type: "media", creds: { public_key: "dummy_pk", private_key: "dummy_sk", url_endpoint: "https://ik.imagekit.io/dummy" } },
      ];
  
      for (const c of credentials) {
        // Since we don't have unique constraint on provider_name per user (maybe?), let's just insert or ignore
        // Or simpler, delete old ones for this user first
        await client.query("DELETE FROM public.provider_credentials WHERE user_id = $1 AND provider_name = $2", [userId, c.name]);

        await client.query(
          `INSERT INTO public.provider_credentials (user_id, provider_name, provider_type, credentials)
           VALUES ($1, $2, $3, $4)`,
          [userId, c.name, c.type, c.creds]
        );
      }
  
      await client.query("COMMIT");
      console.log("Seeding completed successfully!");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("Seeding failed:", e);
    } finally {
      client.release();
      await pool.end();
    }
  };
  
  main();
