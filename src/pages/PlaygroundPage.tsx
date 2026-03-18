import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { compressImage, formatBytes, type CompressResult } from "@/lib/imageCompress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, CloudUpload, FileSearch, Loader2, ImagePlus, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";

interface Credential {
  id: string;
  provider_name: string;
  provider_type: string;
  label: string | null;
  status: string;
}

const PlaygroundPage = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(true);

  const [chatCredentialId, setChatCredentialId] = useState("");
  const [chatModelId, setChatModelId] = useState("");
  const [chatModels, setChatModels] = useState<{ model_id: string; display_name: string; is_default: boolean; supports_vision: boolean }[]>([]);
  const [prompt, setPrompt] = useState("");
  const [chatImage, setChatImage] = useState<CompressResult | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResponse, setChatResponse] = useState<string | null>(null);

  const [uploadCredentialId, setUploadCredentialId] = useState("");
  const [uploadProvider, setUploadProvider] = useState<"cloudinary" | "imagekit">("cloudinary");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<CompressResult | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ url: string; cdn_url?: string; bytes?: number; width?: number; height?: number } | null>(null);

  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<{ name: string; size: number; type: string; compressed?: CompressResult } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const fetchCredentials = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch<Credential[]>("/api/credentials");
      setCredentials(data);
    } catch {
      toast.error("Gagal memuat credentials");
    } finally {
      setLoadingCreds(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoadingCreds(true);
    fetchCredentials();
  }, [user, fetchCredentials]);

  const aiCreds = credentials.filter((c) => c.provider_name === "gemini" || c.provider_name === "groq");
  const cloudCreds = credentials.filter((c) => c.provider_name === "cloudinary" || c.provider_name === "imagekit");

  const chatProvider = chatCredentialId ? aiCreds.find((c) => c.id === chatCredentialId)?.provider_name : null;

  useEffect(() => {
    if (!chatProvider || (chatProvider !== "gemini" && chatProvider !== "groq")) {
      setChatModels([]);
      setChatModelId("");
      return;
    }
    apiFetch<{ models: { model_id: string; display_name: string; is_default: boolean; supports_vision: boolean }[] }>(`/api/playground/models?provider=${chatProvider}`)
      .then((r) => {
        setChatModels(r.models || []);
        const defaultModel = r.models?.find((m) => m.is_default);
        setChatModelId(defaultModel?.model_id ?? r.models?.[0]?.model_id ?? "");
      })
      .catch(() => setChatModels([]));
  }, [chatProvider]);

  const handleChatSend = async () => {
    if (!chatCredentialId || !prompt.trim()) {
      toast.error("Pilih credential dan isi prompt");
      return;
    }
    setChatLoading(true);
    setChatResponse(null);
    try {
      const body: { credential_id: string; prompt: string; image_base64?: string; model_id?: string } = {
        credential_id: chatCredentialId,
        prompt: prompt.trim(),
      };
      if (chatImage?.dataUrl) body.image_base64 = chatImage.dataUrl;
      if (chatModelId) body.model_id = chatModelId;
      const res = await apiFetch<{ text: string }>("/api/playground/chat", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setChatResponse(res.text || "(tanpa teks)");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Gagal mengirim";
      toast.error(msg);
      setChatResponse(`Error: ${msg}`);
    } finally {
      setChatLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Pilih file gambar");
      return;
    }
    compressImage(file).then(setChatImage).catch(() => toast.error("Gagal kompresi gambar"));
  };

  const handleUploadSubmit = async () => {
    if (!uploadCredentialId) {
      toast.error("Pilih credential");
      return;
    }
    const file = uploadPreview?.blob ? new File([uploadPreview.blob], uploadFile?.name || "image.jpg", { type: uploadPreview.mimeType }) : uploadFile;
    if (!file) {
      toast.error("Pilih file untuk di-upload");
      return;
    }
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("credential_id", uploadCredentialId);
      form.append("provider", uploadProvider);
      const res = await apiFetch<{ url: string; cdn_url?: string; bytes?: number; width?: number; height?: number; size?: number }>("/api/playground/upload", {
        method: "POST",
        body: form,
      });
      setUploadResult({ url: res.url, cdn_url: res.cdn_url, bytes: res.bytes ?? res.size, width: res.width, height: res.height });
      toast.success("Upload berhasil");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload gagal");
    } finally {
      setUploadLoading(false);
    }
  };

  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadResult(null);
    if (file.type.startsWith("image/")) {
      compressImage(file).then(setUploadPreview).catch(() => setUploadPreview(null));
    } else {
      setUploadPreview(null);
    }
  };

  const handleAnalyzeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzeFile(file);
    if (file.type.startsWith("image/")) {
      compressImage(file).then((c) => setAnalyzeResult({ name: file.name, size: file.size, type: file.type, compressed: c }));
    } else {
      setAnalyzeResult({ name: file.name, size: file.size, type: file.type });
    }
  };

  const copyUrl = async () => {
    const urlToCopy = uploadResult?.cdn_url ?? uploadResult?.url;
    if (!urlToCopy) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(urlToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = urlToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!ok) throw new Error("execCommand copy failed");
      }
      setCopiedUrl(true);
      toast.success("URL disalin");
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error("Gagal menyalin. Izinkan akses clipboard atau salin manual dari kotak di atas.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Playground" description="Uji coba API key: chat AI, upload cloud, analisis file" />
      {loadingCreds ? (
        <div className="flex min-h-[40vh] items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" /> AI Chat
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-2">
            <CloudUpload className="h-4 w-4" /> Cloud Upload
          </TabsTrigger>
          <TabsTrigger value="analyze" className="gap-2">
            <FileSearch className="h-4 w-4" /> Analisis File
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Chat dengan AI (Gemini / Groq)</CardTitle>
              <p className="text-sm text-muted-foreground">Gambar otomatis dikompresi ~80% agar ringan untuk AI</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Credential</Label>
                <Select value={chatCredentialId} onValueChange={setChatCredentialId}>
                  <SelectTrigger className="mt-1 border-border bg-background">
                    <SelectValue placeholder="Pilih credential Gemini atau Groq" />
                  </SelectTrigger>
                  <SelectContent>
                    {aiCreds.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.provider_name} {c.label ? `· ${c.label}` : ""}
                      </SelectItem>
                    ))}
                    {aiCreds.length === 0 && <SelectItem value="_none" disabled>Belum ada credential AI</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {chatModels.length > 0 && (
                <div>
                  <Label>Model</Label>
                  <Select value={chatModelId} onValueChange={setChatModelId}>
                    <SelectTrigger className="mt-1 border-border bg-background">
                      <SelectValue placeholder="Pilih model" />
                    </SelectTrigger>
                    <SelectContent>
                      {chatModels.map((m) => (
                        <SelectItem key={m.model_id} value={m.model_id}>
                          {m.display_name || m.model_id} {m.is_default ? "(default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Tulis prompt atau pertanyaan..."
                  className="mt-1 min-h-[120px] border-border bg-background"
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4" /> Gambar (opsional, dikompresi 80%)
                </Label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input type="file" accept="image/*" className="hidden" id="chat-image" onChange={handleImageSelect} />
                  <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("chat-image")?.click()}>
                    Pilih gambar
                  </Button>
                  {chatImage && (
                    <span className="text-xs text-muted-foreground">
                      {chatImage.width}×{chatImage.height} · {formatBytes(chatImage.originalSize)} → {formatBytes(chatImage.compressedSize)}
                    </span>
                  )}
                </div>
              </div>
              <Button onClick={handleChatSend} disabled={chatLoading || !chatCredentialId || !prompt.trim()}>
                {chatLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Kirim
              </Button>
              {chatResponse !== null && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">Respons</p>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{chatResponse}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="mt-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Upload ke Cloud (Cloudinary / ImageKit)</CardTitle>
              <p className="text-sm text-muted-foreground">Gambar dikompresi otomatis 80% sebelum upload</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Provider</Label>
                  <Select value={uploadProvider} onValueChange={(v) => setUploadProvider(v as "cloudinary" | "imagekit")}>
                    <SelectTrigger className="mt-1 border-border bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloudinary">Cloudinary</SelectItem>
                      <SelectItem value="imagekit">ImageKit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Credential</Label>
                  <Select value={uploadCredentialId} onValueChange={setUploadCredentialId}>
                    <SelectTrigger className="mt-1 border-border bg-background">
                      <SelectValue placeholder="Pilih credential" />
                    </SelectTrigger>
                    <SelectContent>
                      {cloudCreds.filter((c) => c.provider_name === uploadProvider).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label || c.provider_name}
                        </SelectItem>
                      ))}
                      {cloudCreds.filter((c) => c.provider_name === uploadProvider).length === 0 && (
                        <SelectItem value="_none" disabled>Belum ada credential {uploadProvider}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>File</Label>
                <div
                  className="mt-1 flex min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary/50"); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("border-primary/50")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-primary/50");
                    const f = e.dataTransfer.files[0];
                    if (f) {
                      setUploadFile(f);
                      setUploadResult(null);
                      if (f.type.startsWith("image/")) compressImage(f).then(setUploadPreview).catch(() => setUploadPreview(null));
                      else setUploadPreview(null);
                    }
                  }}
                >
                  <input type="file" accept="image/*" className="hidden" id="upload-file" onChange={handleUploadFileSelect} />
                  <Button type="button" variant="outline" onClick={() => document.getElementById("upload-file")?.click()}>
                    Pilih atau drop gambar
                  </Button>
                  {uploadFile && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {uploadFile.name} · {formatBytes(uploadFile.size)}
                      {uploadPreview && (
                        <span> → kompresi: {formatBytes(uploadPreview.compressedSize)} ({uploadPreview.width}×{uploadPreview.height})</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <Button onClick={handleUploadSubmit} disabled={uploadLoading || !uploadCredentialId || (!uploadFile && !uploadPreview?.blob)}>
                {uploadLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Upload
              </Button>
              {uploadResult && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">URL (CDN)</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs text-muted-foreground">{uploadResult.cdn_url ?? uploadResult.url}</code>
                    <Button variant="ghost" size="icon" onClick={copyUrl}>
                      {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  {(uploadResult.bytes != null || uploadResult.width != null) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {uploadResult.bytes != null && `${formatBytes(uploadResult.bytes)}`}
                      {uploadResult.width != null && uploadResult.height != null && ` · ${uploadResult.width}×${uploadResult.height} px`}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analyze" className="mt-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Analisis & Kompresi File</CardTitle>
              <p className="text-sm text-muted-foreground">Upload file untuk lihat tipe, ukuran; gambar otomatis dianalisis kompresi 80%</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>File</Label>
                <div
                  className="mt-1 flex min-h-[100px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 p-4"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (!f) return;
                    setAnalyzeFile(f);
                    if (f.type.startsWith("image/")) {
                      compressImage(f).then((c) => setAnalyzeResult({ name: f.name, size: f.size, type: f.type, compressed: c }));
                    } else {
                      setAnalyzeResult({ name: f.name, size: f.size, type: f.type });
                    }
                  }}
                >
                  <input type="file" id="analyze-file" className="hidden" onChange={handleAnalyzeFile} />
                  <Button type="button" variant="outline" onClick={() => document.getElementById("analyze-file")?.click()}>
                    Pilih file
                  </Button>
                </div>
              </div>
              {analyzeResult && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">{analyzeResult.name}</p>
                  <p className="text-xs text-muted-foreground">Tipe: {analyzeResult.type} · Ukuran: {formatBytes(analyzeResult.size)}</p>
                  {analyzeResult.compressed && (
                    <div className="mt-2 rounded bg-background p-2 text-xs">
                      <p className="font-medium text-foreground">Setelah kompresi 80%</p>
                      <p className="text-muted-foreground">
                        {analyzeResult.compressed.width}×{analyzeResult.compressed.height} px · {formatBytes(analyzeResult.compressed.compressedSize)} (hemat {Math.round((1 - analyzeResult.compressed.compressedSize / analyzeResult.compressed.originalSize) * 100)}%)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
};

export default PlaygroundPage;
