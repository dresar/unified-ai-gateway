const parseCredentialJson = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export const getApifyTokenFromCredential = (credentialRow) => {
  const credentials = parseCredentialJson(credentialRow?.credentials);
  return String(credentials.api_token ?? credentials.apiToken ?? "").trim();
};

export const normalizeApifyRun = (payload) => {
  const data = payload?.data ?? payload ?? {};
  return {
    id: data.id ?? null,
    status: data.status ?? null,
    actId: data.actId ?? null,
    actorTaskId: data.actorTaskId ?? null,
    startedAt: data.startedAt ?? null,
    finishedAt: data.finishedAt ?? null,
    defaultDatasetId: data.defaultDatasetId ?? null,
    defaultKeyValueStoreId: data.defaultKeyValueStoreId ?? null,
    usageTotalUsd: data.usageTotalUsd ?? null,
    origin: data.origin ?? null,
    raw: payload ?? data,
  };
};

export const normalizeApifyCollection = (payload) => {
  const items = Array.isArray(payload?.data?.items)
    ? payload.data.items
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];
  return {
    total: Number(payload?.data?.total ?? payload?.total ?? items.length ?? 0),
    count: items.length,
    offset: Number(payload?.data?.offset ?? payload?.offset ?? 0),
    limit: Number(payload?.data?.limit ?? payload?.limit ?? items.length ?? 0),
    items,
    raw: payload,
  };
};

export const normalizeApifySmoke = ({ verifyOk, actors, tasks }) => ({
  verifyOk,
  actorsCount: actors.count,
  tasksCount: tasks.count,
  actorPreview: actors.items.slice(0, 5).map((item) => ({
    id: item.id ?? null,
    name: item.name ?? null,
    title: item.title ?? null,
  })),
  taskPreview: tasks.items.slice(0, 5).map((item) => ({
    id: item.id ?? null,
    name: item.name ?? null,
    title: item.title ?? null,
  })),
});
