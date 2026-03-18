import "dotenv/config";
import { PoolManager } from "./src/infra/db.js";
import { runMigrations } from "./src/infra/runMigrations.js";
import { ensureApiKeySchema } from "./src/services/apiKeys.js";
import { ensureObservabilitySchema } from "./src/services/observability.js";
import { ensureAiModelsSchema } from "./src/services/aiModels.js";
import { assertConfig } from "./src/config.js";

assertConfig();

const main = async () => {
  const db = new PoolManager({ initialMax: 1 });
  try {
    await runMigrations(db);
    await ensureApiKeySchema(db);
    await ensureObservabilitySchema(db);
    await ensureAiModelsSchema(db);
    process.stdout.write("Migration selesai\n");
  } finally {
    await db.end();
  }
};

await main();
