export class L2Cache {
  #store = new Map();

  #getEntry(key) {
    const entry = this.#store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.#store.delete(key);
      return null;
    }
    return entry;
  }

  #setEntry(key, value, ttlMs) {
    this.#store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, Number(ttlMs) || 1),
    });
  }

  constructor() {
  }

  async getJson(key) {
    const raw = this.#getEntry(key)?.value ?? null;
    return raw ? JSON.parse(raw) : null;
  }

  async mgetJson(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return [];
    return keys.map((key) => {
      const raw = this.#getEntry(key)?.value ?? null;
      return raw ? JSON.parse(raw) : null;
    });
  }

  async setJson(key, value, ttlMs) {
    this.#setEntry(key, JSON.stringify(value), ttlMs);
  }

  async getResponse(key) {
    const raw = this.#getEntry(key)?.value ?? null;
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
    this.#setEntry(key, JSON.stringify(payload), ttlMs);
  }

  async getText(key) {
    return this.#getEntry(key)?.value ?? null;
  }

  async setText(key, value, ttlMs) {
    this.#setEntry(key, value, ttlMs);
  }

  async delete(key) {
    this.#store.delete(key);
  }
}

