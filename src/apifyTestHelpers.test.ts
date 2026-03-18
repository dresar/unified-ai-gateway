import { describe, expect, it } from "vitest";
import { getApifyTokenFromCredential, normalizeApifyCollection, normalizeApifyRun, normalizeApifySmoke } from "../server/src/services/apifyTest.js";

describe("apify test helpers", () => {
  it("extracts api token from credential json", () => {
    expect(getApifyTokenFromCredential({ credentials: { api_token: "abc123" } })).toBe("abc123");
    expect(getApifyTokenFromCredential({ credentials: JSON.stringify({ apiToken: "xyz789" }) })).toBe("xyz789");
  });

  it("normalizes run payload", () => {
    const normalized = normalizeApifyRun({
      data: {
        id: "run-1",
        status: "SUCCEEDED",
        defaultDatasetId: "dataset-1",
        usageTotalUsd: 0.12,
      },
    });
    expect(normalized.id).toBe("run-1");
    expect(normalized.status).toBe("SUCCEEDED");
    expect(normalized.defaultDatasetId).toBe("dataset-1");
  });

  it("normalizes collection and smoke payload", () => {
    const actors = normalizeApifyCollection({
      data: {
        total: 2,
        items: [{ id: "a1", name: "actor-1" }, { id: "a2", name: "actor-2" }],
      },
    });
    const tasks = normalizeApifyCollection({
      data: {
        total: 1,
        items: [{ id: "t1", name: "task-1" }],
      },
    });
    const smoke = normalizeApifySmoke({ verifyOk: true, actors, tasks });
    expect(actors.count).toBe(2);
    expect(tasks.count).toBe(1);
    expect(smoke.verifyOk).toBe(true);
    expect(smoke.actorPreview).toHaveLength(2);
  });
});
