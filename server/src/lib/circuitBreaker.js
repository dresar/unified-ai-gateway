import { config } from "../config.js";

export class CircuitBreaker {
  #state = new Map();

  constructor({ timeoutMs = config.breakerTimeoutMs, halfOpenAfterMs = config.breakerHalfOpenAfterMs } = {}) {
    this.timeoutMs = timeoutMs;
    this.halfOpenAfterMs = halfOpenAfterMs;
  }

  getState(key) {
    return this.#state.get(key) ?? { mode: "closed", openedAt: 0 };
  }

  canPass(key) {
    const s = this.getState(key);
    if (s.mode === "closed") return true;
    if (s.mode === "open") {
      if (Date.now() - s.openedAt >= this.halfOpenAfterMs) {
        this.#state.set(key, { mode: "half-open", openedAt: s.openedAt });
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess(key) {
    this.#state.set(key, { mode: "closed", openedAt: 0 });
  }

  onFailure(key) {
    const s = this.getState(key);
    if (s.mode === "open") return;
    this.#state.set(key, { mode: "open", openedAt: Date.now() });
  }

  async run(key, fn) {
    if (!this.canPass(key)) throw new Error("CircuitOpen");
    const controller = new AbortController();
    const t = setTimeout(
      () => controller.abort(new DOMException(`Upstream request timed out after ${this.timeoutMs}ms`, "TimeoutError")),
      this.timeoutMs,
    );
    try {
      const result = await fn({ signal: controller.signal });
      this.onSuccess(key);
      return result;
    } catch (err) {
      this.onFailure(key);
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

