/**
 * Jalankan schema.sql ke database (Neon dll). Idempotent: create if not exists, insert on conflict do nothing.
 * Dipanggil sekali saat server start agar Neon otomatis punya tabel terbaru.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(db) {
  const schemaPath = join(__dirname, "../../../db/schema.sql");
  const sql = await readFile(schemaPath, "utf8");
  await db.query(sql);
}
