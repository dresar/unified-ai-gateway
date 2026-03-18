/**
 * AI models untuk Playground. Hanya Gemini (Google) dan Groq — tidak ada OpenAI.
 */
export async function ensureAiModelsSchema(db) {
  await db.query(
    `create table if not exists public.ai_models (
      id uuid not null default gen_random_uuid() primary key,
      provider text not null,
      model_id text not null,
      display_name text,
      is_default boolean not null default false,
      supports_vision boolean not null default false,
      sort_order int not null default 0,
      created_at timestamp with time zone not null default now(),
      unique(provider, model_id)
    )`
  );
  await db.query(`create index if not exists idx_ai_models_provider on public.ai_models(provider, sort_order)`);
  await db.query(`create unique index if not exists idx_ai_models_one_default on public.ai_models(provider) where (is_default = true)`);

  const { rows } = await db.query("select 1 from public.ai_models limit 1");
  if (rows.length === 0) {
    await db.query(
      `insert into public.ai_models (provider, model_id, display_name, is_default, supports_vision, sort_order)
       values
         ('gemini', 'gemini-2.5-flash', 'Gemini 2.5 Flash', true, true, 0),
         ('groq', 'llama-3.2-3b-preview', 'Llama 3.2 3B Instant', true, false, 0),
         ('groq', 'llama-3.1-70b-versatile', 'Llama 3.1 70B Versatile', false, false, 1),
         ('groq', 'llama-3.2-90b-vision-preview', 'Llama 3.2 90B Vision', false, true, 2),
         ('groq', 'llama-3.1-8b-instant', 'Llama 3.1 8B Instant', false, false, 3)`
    );
  }
}

export async function listModels(db, provider) {
  const { rows } = await db.query(
    "select id, provider, model_id, display_name, is_default, supports_vision, sort_order from public.ai_models where provider = $1 order by sort_order, model_id",
    [provider]
  );
  return rows;
}

export async function isModelAllowed(db, provider, modelId) {
  if (!provider || !modelId || typeof modelId !== "string" || !modelId.trim()) return false;
  const { rows } = await db.query(
    "select 1 from public.ai_models where provider = $1 and model_id = $2 limit 1",
    [provider, modelId.trim()]
  );
  return rows.length > 0;
}

export async function getDefaultModelId(db, provider) {
  const { rows } = await db.query(
    "select model_id from public.ai_models where provider = $1 and is_default = true limit 1",
    [provider]
  );
  return rows[0]?.model_id ?? null;
}

export async function getModelSupportsVision(db, provider, modelId) {
  const { rows } = await db.query(
    "select supports_vision from public.ai_models where provider = $1 and model_id = $2 limit 1",
    [provider, modelId]
  );
  return rows[0]?.supports_vision ?? false;
}

/** Mengembalikan model_id satu model dengan supports_vision = true untuk provider, atau null jika tidak ada. */
export async function getVisionModelId(db, provider) {
  const { rows } = await db.query(
    "select model_id from public.ai_models where provider = $1 and supports_vision = true order by sort_order, model_id limit 1",
    [provider]
  );
  return rows[0]?.model_id ?? null;
}

export async function createModel(db, { provider, model_id, display_name, is_default = false, supports_vision = false, sort_order = 0 }) {
  const prov = (provider || "").toLowerCase();
  if (!["gemini", "groq"].includes(prov)) {
    throw new Error("provider harus 'gemini' atau 'groq'");
  }
  const mid = typeof model_id === "string" ? model_id.trim() : "";
  if (!mid) {
    throw new Error("model_id wajib diisi");
  }

  const client = await db.connect();
  try {
    await client.query("begin");
    if (is_default) {
      await client.query("update public.ai_models set is_default = false where provider = $1", [prov]);
    }
    const { rows } = await client.query(
      "insert into public.ai_models (provider, model_id, display_name, is_default, supports_vision, sort_order) values ($1, $2, $3, $4, $5, $6) returning id, provider, model_id, display_name, is_default, supports_vision, sort_order",
      [prov, mid, display_name ?? null, !!is_default, !!supports_vision, sort_order ?? 0]
    );
    await client.query("commit");
    return rows[0];
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteModelById(db, id) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select provider, is_default from public.ai_models where id = $1 limit 1",
      [id]
    );
    const current = rows[0];
    if (!current) {
      await client.query("commit");
      return { deleted: false };
    }

    await client.query("delete from public.ai_models where id = $1", [id]);

    if (current.is_default) {
      const { rows: other } = await client.query(
        "select id from public.ai_models where provider = $1 order by sort_order, model_id limit 1",
        [current.provider]
      );
      if (other[0]) {
        await client.query(
          "update public.ai_models set is_default = true where id = $1",
          [other[0].id]
        );
      }
    }

    await client.query("commit");
    return { deleted: true };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateModel(db, id, { display_name, supports_vision, is_default }) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select provider from public.ai_models where id = $1 limit 1",
      [id]
    );
    const current = rows[0];
    if (!current) {
      await client.query("commit");
      return null;
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (display_name !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(display_name);
    }
    if (supports_vision !== undefined) {
      fields.push(`supports_vision = $${idx++}`);
      values.push(!!supports_vision);
    }
    if (is_default === true) {
      await client.query(
        "update public.ai_models set is_default = false where provider = $1",
        [current.provider]
      );
      fields.push(`is_default = $${idx++}`);
      values.push(true);
    } else if (is_default === false) {
      fields.push(`is_default = $${idx++}`);
      values.push(false);
    }

    if (fields.length > 0) {
      values.push(id);
      const setSql = fields.join(", ");
      await client.query(
        `update public.ai_models set ${setSql} where id = $${idx}`,
        values
      );
    }

    const { rows: updated } = await client.query(
      "select id, provider, model_id, display_name, is_default, supports_vision, sort_order from public.ai_models where id = $1",
      [id]
    );

    await client.query("commit");
    return updated[0] ?? null;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
