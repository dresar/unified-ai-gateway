import { createHash } from "node:crypto";

const hash32 = (input) => {
  const buf = createHash("sha256").update(input).digest();
  return buf.readUInt32BE(0);
};

export class ConsistentHashRing {
  #replicas;
  #ring = [];

  constructor(nodes, { replicas = 100 } = {}) {
    this.#replicas = replicas;
    this.setNodes(nodes);
  }

  setNodes(nodes) {
    const ring = [];
    for (const node of nodes) {
      for (let i = 0; i < this.#replicas; i += 1) {
        ring.push({ hash: hash32(`${node}#${i}`), node });
      }
    }
    ring.sort((a, b) => a.hash - b.hash);
    this.#ring = ring;
  }

  pick(key) {
    if (this.#ring.length === 0) return null;
    const h = hash32(key);
    let lo = 0;
    let hi = this.#ring.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.#ring[mid].hash === h) return this.#ring[mid].node;
      if (this.#ring[mid].hash < h) lo = mid + 1;
      else hi = mid - 1;
    }
    return this.#ring[lo % this.#ring.length].node;
  }
}

