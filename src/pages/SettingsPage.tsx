import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Sliders, Brain, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";

const defaultSettings = {
  default_rate_limit: 100,
  cooldown_duration_seconds: 300,
  max_retries: 3,
  log_retention_days: 30,
  upload_expiry_minutes: "" as number | "",
};

type Settings = typeof defaultSettings;
type SettingKey = keyof Settings;

const isSettingKey = (value: string): value is SettingKey => value in defaultSettings;

const parseNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Untuk upload_expiry_minutes: kosong = simpan selamanya. */
const parseUploadExpiry = (value: unknown): number | "" => {
  const n = parseNumberValue(value);
  if (n === null || n <= 0) return "";
  return n;
};

type AiModel = {
  id: string;
  provider: "gemini" | "groq";
  model_id: string;
  display_name: string | null;
  is_default: boolean;
  supports_vision: boolean;
  sort_order: number;
};

const SettingsPage = () => {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({ displayName: "", email: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [modelsGemini, setModelsGemini] = useState<AiModel[]>([]);
  const [modelsGroq, setModelsGroq] = useState<AiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelForm, setModelForm] = useState<{
    provider: "gemini" | "groq";
    model_id: string;
    display_name: string;
    supports_vision: boolean;
    is_default: boolean;
    sort_order: number | "";
  }>({
    provider: "gemini",
    model_id: "",
    display_name: "",
    supports_vision: false,
    is_default: false,
    sort_order: "",
  });
  const [modelSaving, setModelSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        displayName: user.displayName ?? "",
        email: user.email ?? "",
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    apiFetch<Record<string, unknown>>("/api/settings")
      .then((data) => {
        const merged: Settings = { ...defaultSettings };
        Object.entries(data).forEach(([key, value]) => {
          if (!isSettingKey(key)) return;
          if (key === "upload_expiry_minutes") {
            merged[key] = parseUploadExpiry(value);
            return;
          }
          const parsed = parseNumberValue(value);
          if (parsed !== null) merged[key] = parsed;
        });
        setSettings(merged);
      })
      .catch(() => {});
  }, [user]);

  const loadModels = async () => {
    if (!user) return;
    setModelsLoading(true);
    try {
      const [geminiRes, groqRes] = await Promise.all([
        apiFetch<{ models: AiModel[] }>("/api/playground/models?provider=gemini"),
        apiFetch<{ models: AiModel[] }>("/api/playground/models?provider=groq"),
      ]);
      setModelsGemini(geminiRes.models ?? []);
      setModelsGroq(groqRes.models ?? []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal memuat model AI");
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadModels().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    try {
      const updated = await apiFetch<{ id: string; email: string; displayName: string | null }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: profile.displayName, email: profile.email }),
      });
      setUser({ id: updated.id, email: updated.email, displayName: updated.displayName });
      toast.success("Profil diperbarui");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan profil");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Password baru dan konfirmasi tidak sama");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password baru minimal 8 karakter");
      return;
    }
    setPasswordSaving(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      toast.success("Password berhasil diubah");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal mengubah password");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSettingsSaving(true);
    try {
      await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ settings }) });
      toast.success("Pengaturan disimpan");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelForm.model_id.trim()) {
      toast.error("model_id wajib diisi");
      return;
    }
    setModelSaving(true);
    try {
      await apiFetch("/api/playground/models", {
        method: "POST",
        body: JSON.stringify({
          provider: modelForm.provider,
          model_id: modelForm.model_id.trim(),
          display_name: modelForm.display_name.trim() || null,
          supports_vision: modelForm.supports_vision,
          is_default: modelForm.is_default,
          sort_order: typeof modelForm.sort_order === "number" ? modelForm.sort_order : undefined,
        }),
      });
      toast.success("Model AI ditambahkan");
      setModelForm({
        provider: "gemini",
        model_id: "",
        display_name: "",
        supports_vision: false,
        is_default: false,
        sort_order: "",
      });
      await loadModels();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menambah model");
    } finally {
      setModelSaving(false);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!window.confirm("Hapus model ini?")) return;
    try {
      await apiFetch(`/api/playground/models/${id}`, { method: "DELETE" });
      toast.success("Model dihapus");
      await loadModels();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menghapus model");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="System Settings" description="Profil, keamanan, dan konfigurasi gateway" />

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="inline-flex h-auto w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1.5 md:w-auto md:flex-nowrap">
          <TabsTrigger value="profile" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <User className="h-4 w-4 shrink-0" /> Profil
          </TabsTrigger>
          <TabsTrigger value="password" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Lock className="h-4 w-4 shrink-0" /> Ganti Password
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Sliders className="h-4 w-4 shrink-0" /> Pengaturan
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Brain className="h-4 w-4 shrink-0" /> Model AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Profil Saya</CardTitle>
              <CardDescription>Ubah nama tampilan dan email</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="max-w-md space-y-4">
                <div>
                  <Label htmlFor="displayName">Nama tampilan</Label>
                  <Input
                    id="displayName"
                    value={profile.displayName}
                    onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                    placeholder="Nama Anda"
                    className="mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    placeholder="email@example.com"
                    className="mt-1 bg-background"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Email digunakan untuk login</p>
                </div>
                <Button type="submit" disabled={profileSaving}>
                  {profileSaving ? "Menyimpan..." : "Simpan Profil"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="mt-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Ganti Password</CardTitle>
              <CardDescription>Password baru minimal 8 karakter</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
                <div>
                  <Label htmlFor="current">Password lama</Label>
                  <Input
                    id="current"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 bg-background"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="new">Password baru</Label>
                  <Input
                    id="new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 bg-background"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="confirm">Konfirmasi password baru</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 bg-background"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" disabled={passwordSaving}>
                  {passwordSaving ? "Mengubah..." : "Ganti Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Pengaturan Gateway</CardTitle>
              <CardDescription>Konfigurasi default rate limit, cooldown, dan retensi log</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSettings} className="max-w-md space-y-4">
                <div>
                  <Label>Default Rate Limit (req/menit)</Label>
                  <Input
                    type="number"
                    value={settings.default_rate_limit}
                    onChange={(e) => setSettings({ ...settings, default_rate_limit: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label>Cooldown Duration (detik)</Label>
                  <Input
                    type="number"
                    value={settings.cooldown_duration_seconds}
                    onChange={(e) => setSettings({ ...settings, cooldown_duration_seconds: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label>Max Retries</Label>
                  <Input
                    type="number"
                    value={settings.max_retries}
                    onChange={(e) => setSettings({ ...settings, max_retries: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label>Log Retention (hari)</Label>
                  <Input
                    type="number"
                    value={settings.log_retention_days}
                    onChange={(e) => setSettings({ ...settings, log_retention_days: parseInt(e.target.value) || 0 })}
                    className="mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label>Upload Expiry – API Client (menit)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Kosong = simpan selamanya"
                    value={settings.upload_expiry_minutes === "" ? "" : settings.upload_expiry_minutes}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettings({ ...settings, upload_expiry_minutes: v === "" ? "" : parseInt(v, 10) || 0 });
                    }}
                    className="mt-1 bg-background"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Untuk upload via API (Cloudinary/ImageKit), file akan dihapus otomatis setelah jumlah menit yang ditentukan. Kosongkan nilai ini untuk menyimpan file tanpa batas waktu.
                  </p>
                </div>
                <Button type="submit" disabled={settingsSaving}>
                  {settingsSaving ? "Menyimpan..." : "Simpan Pengaturan"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="mt-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <Brain className="h-5 w-5 text-primary" />
                Kelola Model AI
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Kelola model Gemini dan Groq yang tersedia untuk endpoint chat gateway. Hanya model yang terdaftar di sini yang dapat digunakan.
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
              {/* Daftar model */}
              <div className="space-y-6">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">G</span>
                    Gemini
                  </h3>
                  {modelsLoading && !modelsGemini.length ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Memuat model...</p>
                  ) : modelsGemini.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Belum ada model. Tambah lewat form di samping.</p>
                  ) : (
                    <ul className="space-y-2">
                      {modelsGemini.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background px-4 py-3 shadow-sm transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{m.display_name || m.model_id}</p>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{m.model_id}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.is_default && (
                                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">Default</span>
                              )}
                              {m.supports_vision && (
                                <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">Vision</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleDeleteModel(m.id)}
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" /> Hapus
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">Q</span>
                    Groq
                  </h3>
                  {modelsLoading && !modelsGroq.length ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Memuat model...</p>
                  ) : modelsGroq.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Belum ada model. Tambah lewat form di samping.</p>
                  ) : (
                    <ul className="space-y-2">
                      {modelsGroq.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background px-4 py-3 shadow-sm transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{m.display_name || m.model_id}</p>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{m.model_id}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.is_default && (
                                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">Default</span>
                              )}
                              {m.supports_vision && (
                                <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">Vision</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleDeleteModel(m.id)}
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" /> Hapus
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Form tambah */}
              <Card className="border-border bg-card shadow-md">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base text-foreground">
                    <Plus className="h-4 w-4" />
                    Tambah Model Baru
                  </CardTitle>
                  <CardDescription>
                    Isi Model ID sesuai dokumentasi provider (contoh: gemini-2.5-flash, llama-3.1-70b-versatile).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateModel} className="space-y-4">
                    <div>
                      <Label htmlFor="model-provider">Provider</Label>
                      <select
                        id="model-provider"
                        className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={modelForm.provider}
                        onChange={(e) =>
                          setModelForm((prev) => ({
                            ...prev,
                            provider: e.target.value as "gemini" | "groq",
                          }))
                        }
                      >
                        <option value="gemini">Gemini (Google)</option>
                        <option value="groq">Groq</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="model-id">Model ID *</Label>
                      <Input
                        id="model-id"
                        value={modelForm.model_id}
                        onChange={(e) =>
                          setModelForm((prev) => ({ ...prev, model_id: e.target.value }))
                        }
                        placeholder="contoh: gemini-2.5-flash"
                        className="mt-1.5 bg-background font-mono"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="model-display">Nama tampilan (opsional)</Label>
                      <Input
                        id="model-display"
                        value={modelForm.display_name}
                        onChange={(e) =>
                          setModelForm((prev) => ({ ...prev, display_name: e.target.value }))
                        }
                        placeholder="Nama yang tampil di dropdown"
                        className="mt-1.5 bg-background"
                      />
                    </div>
                    <div>
                      <Label htmlFor="model-sort">Sort order (opsional)</Label>
                      <Input
                        id="model-sort"
                        type="number"
                        value={modelForm.sort_order}
                        onChange={(e) =>
                          setModelForm((prev) => ({
                            ...prev,
                            sort_order: e.target.value === "" ? "" : Number(e.target.value),
                          }))
                        }
                        className="mt-1.5 bg-background"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-3">
                      <label className="flex cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          checked={modelForm.is_default}
                          onChange={(e) =>
                            setModelForm((prev) => ({ ...prev, is_default: e.target.checked }))
                          }
                        />
                        <span>Jadikan default untuk provider ini</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          checked={modelForm.supports_vision}
                          onChange={(e) =>
                            setModelForm((prev) => ({
                              ...prev,
                              supports_vision: e.target.checked,
                            }))
                          }
                        />
                        <span>Mendukung Vision (input gambar)</span>
                      </label>
                    </div>
                    <Button type="submit" disabled={modelSaving} className="w-full">
                      {modelSaving ? "Menyimpan..." : "Tambah Model"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
