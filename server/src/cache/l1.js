export class L1Cache {
  #map = new Map();
  #maxSize;

  constructor(maxSize = 1000) {
    this.#maxSize = maxSize;
  }

  get(key) {
    const hit = this.#map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.#map.delete(key);
      return null;
    }
    // Promote to newest (LRU)
    this.#map.delete(key);
    this.#map.set(key, hit);
    return hit.value;
  }

  delete(key) {
    this.#map.delete(key);
  }

  set(key, value, ttlMs) {
    if (this.#map.size >= this.#maxSize) {
      const oldest = this.#map.keys().next().value;
      this.#map.delete(oldest);
    }
    const expiresAt = Date.now() + ttlMs;
    // Delete existing to update position (LRU)
    this.#map.delete(key);
    this.#map.set(key, { value, expiresAt });
  }

  getStale(key) {
    const hit = this.#map.get(key);
    return hit ? hit.value : null;
  }
}

