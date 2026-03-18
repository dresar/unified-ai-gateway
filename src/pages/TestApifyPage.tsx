import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlayCircle, Search, ShieldCheck, TableProperties } from "lucide-react";

interface GatewayKey {
  id: string;
  name?: string | null;
  allowed_providers?: string[];
  api_key_plain?: string | null;
}

interface ApifyCollection {
  total: number;
  count: number;
  offset: number;
  limit: number;
  items: Array<Record<string, unknown>>;
  raw: unknown;
}

interface ApifyRun {
  id: string | null;
  status: string | null;
  actId: string | null;
  actorTaskId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  defaultDatasetId: string | null;
  defaultKeyValueStoreId: string | null;
  usageTotalUsd: number | null;
  origin: string | null;
  raw: unknown;
}

function getDefaultBaseUrl(): string {
  if (import.meta.env.VITE_GATEWAY_URL) return import.meta.env.VITE_GATEWAY_URL;
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) return apiBase;
  return "";
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

const TestApifyPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [keys, setKeys] = useState<GatewayKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => getDefaultBaseUrl());
  const [loadingAction, setLoadingAction] = useState("");
  const [rawResponse, setRawResponse] = useState("{}");

  const [actorsLimit, setActorsLimit] = useState("10");
  const [tasksLimit, setTasksLimit] = useState("10");
  const [datasetLimit, setDatasetLimit] = useState("10");
  const [runMode, setRunMode] = useState<"actor" | "task">("actor");
  const [targetId, setTargetId] = useState("");
  const [waitForFinish, setWaitForFinish] = useState("30");
  const [inputJson, setInputJson] = useState("{}");
  const [runId, setRunId] = useState("");
  const [datasetId, setDatasetId] = useState("");

  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);
  const [smokeResult, setSmokeResult] = useState<Record<string, unknown> | null>(null);
  const [actorsResult, setActorsResult] = useState<ApifyCollection | null>(null);
  const [tasksResult, setTasksResult] = useState<ApifyCollection | null>(null);
  const [runResult, setRunResult] = useState<ApifyRun | null>(null);
  const [runStatusResult, setRunStatusResult] = useState<ApifyRun | null>(null);
  const [datasetResult, setDatasetResult] = useState<ApifyCollection | null>(null);

  useEffect(() => {
    if (!user) return;
    setKeysLoading(true);
    apiFetch<GatewayKey[]>("/api/dashboard/keys")
      .then((data) => {
        const apifyKeys = (Array.isArray(data) ? data : []).filter((item) => (item.allowed_providers ?? []).includes("apify"));
        setKeys(apifyKeys);
        if (apifyKeys.length > 0) setSelectedKeyId((prev) => prev || apifyKeys[0].id);
      })
      .catch(() => toast.error("Gagal memuat Gateway API key Apify"))
      .finally(() => setKeysLoading(false));
  }, [user]);

  const selectedKey = useMemo(() => keys.find((item) => item.id === selectedKeyId) ?? null, [keys, selectedKeyId]);

  const runPreviewPath = runMode === "task"
    ? `/actor-tasks/${targetId || ":taskId"}/runs?waitForFinish=${waitForFinish || "30"}`
    : `/acts/${targetId || ":actorId"}/runs?waitForFinish=${waitForFinish || "30"}`;

  const setRaw = (value: unknown) => setRawResponse(pretty(value));

  const withLoading = async <T,>(key: string, fn: () => Promise<T>) => {
    setLoadingAction(key);
    try {
      return await fn();
    } finally {
      setLoadingAction("");
    }
  };

  const requireKey = () => {
    if (!selectedKeyId) {
      toast.error("Pilih Gateway API key Apify terlebih dahulu");
      return false;
    }
    return true;
  };

  const handleVerify = async () => {
    if (!requireKey()) return;
    await withLoading("verify", async () => {
      try {
        const res = await apiFetch<Record<string, unknown>>("/api/apify/test/verify", {
          method: "POST",
          body: JSON.stringify({ api_key_id: selectedKeyId }),
        });
        setVerifyResult(res);
        setRaw(res);
        toast.success("Verify Apify berhasil");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Verify gagal");
      }
    });
  };

  const handleSmoke = async () => {
    if (!requireKey()) return;
    await withLoading("smoke", async () => {
      try {
        const res = await apiFetch<Record<string, unknown>>("/api/apify/test/smoke", {
          method: "POST",
          body: JSON.stringify({ api_key_id: selectedKeyId }),
        });
        setSmokeResult(res);
        setRaw(res);
        toast.success("Smoke test Apify selesai");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Smoke test gagal");
      }
    });
  };

  const handleListActors = async () => {
    if (!requireKey()) return;
    await withLoading("actors", async () => {
      try {
        const res = await apiFetch<ApifyCollection>(`/api/apify/test/actors?apiKeyId=${encodeURIComponent(selectedKeyId)}&limit=${encodeURIComponent(actorsLimit || "10")}`);
        setActorsResult(res);
        setRaw(res.raw ?? res);
        toast.success("Daftar actor berhasil dimuat");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Gagal memuat actors");
      }
    });
  };

  const handleListTasks = async () => {
    if (!requireKey()) return;
    await withLoading("tasks", async () => {
      try {
        const res = await apiFetch<ApifyCollection>(`/api/apify/test/tasks?apiKeyId=${encodeURIComponent(selectedKeyId)}&limit=${encodeURIComponent(tasksLimit || "10")}`);
        setTasksResult(res);
        setRaw(res.raw ?? res);
        toast.success("Daftar task berhasil dimuat");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Gagal memuat tasks");
      }
    });
  };

  const handleRun = async () => {
    if (!requireKey()) return;
    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = inputJson.trim() ? JSON.parse(inputJson) : {};
    } catch {
      toast.error("Input JSON tidak valid");
      return;
    }
    if (!targetId.trim()) {
      toast.error(`${runMode === "task" ? "Task ID" : "Actor ID"} wajib diisi`);
      return;
    }
    await withLoading("run", async () => {
      try {
        const res = await apiFetch<ApifyRun>("/api/apify/test/run", {
          method: "POST",
          body: JSON.stringify({
            api_key_id: selectedKeyId,
            mode: runMode,
            target_id: targetId.trim(),
            wait_for_finish: Number(waitForFinish) || 30,
            input: parsedInput,
          }),
        });
        setRunResult(res);
        if (res.id) setRunId(res.id);
        if (res.defaultDatasetId) setDatasetId(res.defaultDatasetId);
        setRaw(res.raw ?? res);
        toast.success("Run Apify berhasil dikirim");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Run Apify gagal");
      }
    });
  };

  const handleLoadRunStatus = async () => {
    if (!requireKey()) return;
    if (!runId.trim()) {
      toast.error("Run ID wajib diisi");
      return;
    }
    await withLoading("status", async () => {
      try {
        const res = await apiFetch<ApifyRun>(`/api/apify/test/runs/${encodeURIComponent(runId.trim())}?apiKeyId=${encodeURIComponent(selectedKeyId)}`);
        setRunStatusResult(res);
        if (res.defaultDatasetId) setDatasetId(res.defaultDatasetId);
        setRaw(res.raw ?? res);
        toast.success("Status run berhasil dimuat");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Gagal memuat status run");
      }
    });
  };

  const handleLoadDataset = async () => {
    if (!requireKey()) return;
    if (!datasetId.trim()) {
      toast.error("Dataset ID wajib diisi");
      return;
    }
    await withLoading("dataset", async () => {
      try {
        const res = await apiFetch<ApifyCollection>(`/api/apify/test/datasets/${encodeURIComponent(datasetId.trim())}/items?apiKeyId=${encodeURIComponent(selectedKeyId)}&limit=${encodeURIComponent(datasetLimit || "10")}`);
        setDatasetResult(res);
        setRaw(res.raw ?? res);
        toast.success("Dataset items berhasil dimuat");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Gagal memuat dataset items");
      }
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Test Apify"
        description="Uji smoke test, list actors/tasks, run actor/task, cek status run, dan lihat dataset items lewat gateway Apify."
      />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Gateway API Key Apify</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Gateway API Key</Label>
            {keysLoading ? (
              <p className="text-sm text-muted-foreground">Memuat daftar key...</p>
            ) : keys.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">
                  Belum ada Gateway API key dengan provider `apify`. Buat dulu di halaman API Clients.
                </p>
                <Button type="button" variant="outline" className="mt-3" onClick={() => navigate("/clients")}>
                  Buka API Clients
                </Button>
              </div>
            ) : (
              <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                <SelectTrigger className="border-border">
                  <SelectValue placeholder="Pilih Gateway API key Apify" />
                </SelectTrigger>
                <SelectContent>
                  {keys.map((key) => (
                    <SelectItem key={key.id} value={key.id}>
                      {key.name || `Key ${key.id.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Gateway Base URL (referensi)</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:8787" className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label>Allowed Provider</Label>
              <Input value="apify" readOnly className="font-mono text-sm bg-muted/40" />
            </div>
          </div>

          {selectedKey && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              Key aktif: <span className="font-medium text-foreground">{selectedKey.name || selectedKey.id}</span>
              {selectedKey.api_key_plain ? <span className="block mt-1 font-mono break-all">{selectedKey.api_key_plain}</span> : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="smoke" className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="smoke">Smoke Test</TabsTrigger>
          <TabsTrigger value="catalog">Actors & Tasks</TabsTrigger>
          <TabsTrigger value="run">Run Actor/Task</TabsTrigger>
          <TabsTrigger value="inspect">Run Status & Dataset</TabsTrigger>
          <TabsTrigger value="response">Raw Response</TabsTrigger>
        </TabsList>

        <TabsContent value="smoke" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Default Smoke Test</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleVerify} disabled={!!loadingAction || keys.length === 0}>
                  {loadingAction === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Verify
                </Button>
                <Button type="button" variant="outline" onClick={handleSmoke} disabled={!!loadingAction || keys.length === 0}>
                  {loadingAction === "smoke" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Smoke Test
                </Button>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Default smoke flow: `verify`, `GET /acts?limit=10`, `GET /actor-tasks?limit=10`.
              </div>
              {verifyResult && (
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">Verify Result</p>
                  <pre className="mt-2 overflow-auto rounded border border-border bg-background/70 p-3 text-xs">{pretty(verifyResult)}</pre>
                </div>
              )}
              {smokeResult && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Verify</p>
                    <p className="text-lg font-semibold text-foreground">{String(smokeResult.verifyOk ?? false)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Actors</p>
                    <p className="text-lg font-semibold text-foreground">{String(smokeResult.actorsCount ?? 0)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Tasks</p>
                    <p className="text-lg font-semibold text-foreground">{String(smokeResult.tasksCount ?? 0)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">List Actors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={actorsLimit} onChange={(e) => setActorsLimit(e.target.value)} placeholder="10" />
                  <Button type="button" onClick={handleListActors} disabled={!!loadingAction || keys.length === 0}>
                    {loadingAction === "actors" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Muat
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">GET {baseUrl || "(origin)"} /gateway/apify/acts?limit={actorsLimit || "10"}</p>
                <div className="space-y-2">
                  {(actorsResult?.items ?? []).slice(0, 10).map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-sm font-medium text-foreground">{String(item.title ?? item.name ?? item.id ?? "Actor")}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{String(item.id ?? "-")}</p>
                    </div>
                  ))}
                  {actorsResult && actorsResult.items.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada actor.</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">List Tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={tasksLimit} onChange={(e) => setTasksLimit(e.target.value)} placeholder="10" />
                  <Button type="button" onClick={handleListTasks} disabled={!!loadingAction || keys.length === 0}>
                    {loadingAction === "tasks" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TableProperties className="h-4 w-4" />}
                    Muat
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">GET {baseUrl || "(origin)"} /gateway/apify/actor-tasks?limit={tasksLimit || "10"}</p>
                <div className="space-y-2">
                  {(tasksResult?.items ?? []).slice(0, 10).map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-sm font-medium text-foreground">{String(item.title ?? item.name ?? item.id ?? "Task")}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{String(item.id ?? "-")}</p>
                    </div>
                  ))}
                  {tasksResult && tasksResult.items.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada task.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="run" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Run Actor / Task</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={runMode} onValueChange={(value) => setRunMode(value as "actor" | "task")}>
                    <SelectTrigger className="border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actor">Actor</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{runMode === "task" ? "Task ID / Name" : "Actor ID / Name"}</Label>
                  <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder={runMode === "task" ? "contoh: user~task-name" : "contoh: user~actor-name"} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>waitForFinish</Label>
                  <Input value={waitForFinish} onChange={(e) => setWaitForFinish(e.target.value)} placeholder="30" />
                </div>
                <div className="space-y-2">
                  <Label>Path Preview</Label>
                  <Input readOnly value={runPreviewPath} className="font-mono text-xs bg-muted/40" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Input JSON</Label>
                <Textarea value={inputJson} onChange={(e) => setInputJson(e.target.value)} rows={10} className="font-mono text-xs" />
              </div>
              <Button type="button" onClick={handleRun} disabled={!!loadingAction || keys.length === 0}>
                {loadingAction === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Jalankan
              </Button>
              {runResult && (
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Run ID</p>
                    <p className="mt-1 text-sm font-medium text-foreground break-all">{runResult.id || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={runResult.status === "SUCCEEDED" ? "default" : "secondary"}>{runResult.status || "-"}</Badge>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Dataset</p>
                    <p className="mt-1 text-sm font-medium text-foreground break-all">{runResult.defaultDatasetId || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Usage USD</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{runResult.usageTotalUsd ?? "-"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inspect" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Run Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input value={runId} onChange={(e) => setRunId(e.target.value)} placeholder="Masukkan run ID" />
                <Button type="button" onClick={handleLoadRunStatus} disabled={!!loadingAction || keys.length === 0}>
                  {loadingAction === "status" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Cek Status Run
                </Button>
                {runStatusResult && (
                  <pre className="overflow-auto rounded border border-border bg-muted/20 p-3 text-xs">{pretty(runStatusResult)}</pre>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Dataset Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <Input value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder="Masukkan dataset ID" />
                  <Input value={datasetLimit} onChange={(e) => setDatasetLimit(e.target.value)} placeholder="10" />
                </div>
                <Button type="button" onClick={handleLoadDataset} disabled={!!loadingAction || keys.length === 0}>
                  {loadingAction === "dataset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TableProperties className="h-4 w-4" />}
                  Ambil Dataset Items
                </Button>
                {datasetResult && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                      Total preview: <span className="font-medium text-foreground">{datasetResult.count}</span>
                    </div>
                    <pre className="max-h-[320px] overflow-auto rounded border border-border bg-muted/20 p-3 text-xs">{pretty(datasetResult.items)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="response" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Raw JSON Response</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[560px] overflow-auto rounded border border-border bg-muted/20 p-4 text-xs">{rawResponse}</pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TestApifyPage;
