export class L2Cache {
  #redis;

  constructor(redis) {
    this.#redis = redis;
  }

  async getJson(key) {
    const raw = await this.#redis.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  async mgetJson(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return [];
    const rawValues = typeof this.#redis.mget === "function"
      ? await this.#redis.mget(...keys)
      : await Promise.all(keys.map((key) => this.#redis.get(key)));
    return rawValues.map((raw) => (raw ? JSON.parse(raw) : null));
  }

  async setJson(key, value, ttlMs) {
    await this.#redis.set(key, JSON.stringify(value), { PX: ttlMs });
  }

  async getResponse(key) {
    const raw = await this.#redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    let body = null;
    if (parsed?.body_base64) {
      body = Buffer.from(parsed.body_base64, "base64");
    } else if (parsed?.body?.type === "Buffer" && Array.isArray(parsed.body.data)) {
      body = Buffer.from(parsed.body.data);
    } else if (typeof parsed?.body === "string") {
      body = Buffer.from(parsed.body);
    }
    return {
      ...parsed,
      body,
    };
  }

  async setResponse(key, value, ttlMs) {
    const payload = {
      status: value.status,
      headers: value.headers,
      body_base64: value.body ? Buffer.from(value.body).toString("base64") : null,
    };
    await this.#redis.set(key, JSON.stringify(payload), { PX: ttlMs });
  }

  async getText(key) {
    return (await this.#redis.get(key)) ?? null;
  }

  async setText(key, value, ttlMs) {
    await this.#redis.set(key, value, { PX: ttlMs });
  }
}

