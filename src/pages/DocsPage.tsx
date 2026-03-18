import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Key,
  Globe,
  MessageSquare,
  Upload,
  Shield,
  AlertCircle,
  Code2,
  Zap,
  Terminal,
  Send,
} from "lucide-react";

function getDocsBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_GATEWAY_URL as string) || (import.meta.env.VITE_API_BASE_URL as string);
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "";
}

const BASE_URL = getDocsBaseUrl();

type SectionId = "pengenalan" | "base-auth" | "proxy" | "apify" | "chat" | "upload" | "rate-errors" | "postman-terminal" | "contoh";

const SECTIONS: { id: SectionId; label: string; icon: typeof BookOpen }[] = [
  { id: "pengenalan", label: "Pengenalan", icon: BookOpen },
  { id: "base-auth", label: "Base URL & Auth", icon: Key },
  { id: "proxy", label: "Endpoint Proxy", icon: Globe },
  { id: "apify", label: "Apify", icon: Globe },
  { id: "chat", label: "Chat API", icon: MessageSquare },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "rate-errors", label: "Rate limit & Error", icon: Shield },
  { id: "postman-terminal", label: "Postman & Terminal", icon: Terminal },
  { id: "contoh", label: "Contoh Kode", icon: Code2 },
];

const DocsPage = () => {
  const isMobile = useIsMobile();
  const [activeId, setActiveId] = useState<SectionId>("pengenalan");

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Dokumentasi"
        description="Panduan integrasi gateway untuk curl, n8n, Python, dan Node.js."
      />

      {/* Hero ringkas */}
      <div className="mb-6 rounded-xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-4 sm:p-6">
        <div className="flex items-center gap-2 text-primary">
          <Zap className="h-5 w-5 sm:h-6 sm:w-6" />
          <span className="font-heading text-xs font-semibold uppercase tracking-wide sm:text-sm">API Gateway</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Satu gateway untuk Gemini, Groq, Apify, Cloudinary & ImageKit. Pilih menu di kiri untuk melihat panduan.
        </p>
      </div>

      {/* Layout: menu kiri + konten kanan */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Menu kiri — klik untuk ganti halaman */}
        <nav
          className={cn(
            "shrink-0",
            isMobile
              ? "flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory"
              : "lg:w-52",
          )}
        >
          <div
            className={cn(
              "flex gap-1 rounded-xl border border-border bg-card p-2",
              isMobile ? "flex-row min-w-max" : "flex-col",
            )}
          >
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors shrink-0 snap-start",
                  activeId === s.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Konten kanan — hanya halaman yang dipilih */}
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 sm:p-6 lg:p-8">
          {activeId === "pengenalan" && <ContentPengenalan />}
          {activeId === "base-auth" && <ContentBaseAuth />}
          {activeId === "proxy" && <ContentProxy />}
          {activeId === "apify" && <ContentApify />}
          {activeId === "chat" && <ContentChat />}
          {activeId === "upload" && <ContentUpload />}
          {activeId === "rate-errors" && <ContentRateErrors />}
          {activeId === "postman-terminal" && <ContentPostmanTerminal />}
          {activeId === "contoh" && <ContentContoh />}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        API key dibuat di API Clients · Credentials provider dikelola di Credentials
      </div>
    </div>
  );
};

function ContentPengenalan() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Pengenalan</h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Gateway ini menerima request dari aplikasi Anda (n8n, Python, Node.js, curl, dll), memvalidasi API key,
          lalu meneruskan request ke provider (Gemini, Groq, Apify, Cloudinary, ImageKit). Anda mengelola credential provider
          di dashboard; client hanya perlu satu API key gateway.
        </p>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>Satu API key untuk banyak provider (sesuai allowed providers)</li>
          <li>Quota per menit per key</li>
          <li>Opsional: client auth (Basic) per key</li>
          <li>Log request untuk statistik 7 hari</li>
        </ul>
      </div>
    </>
  );
}

function ContentBaseAuth() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Base URL & Autentikasi</h2>
      <div className="mt-4 space-y-4">
        <Card className="border-border bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Base URL</CardTitle>
            <CardDescription>
              Lokal: localhost. Production: ganti dengan domain Anda (mis. https://api.domain.com)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg border border-border bg-background/80 p-3 font-mono text-xs break-all overflow-x-auto">
              {BASE_URL}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              {BASE_URL.startsWith("http://localhost") || BASE_URL.startsWith("http://127.")
                ? "Untuk production, set VITE_GATEWAY_URL atau VITE_API_BASE_URL ke domain Anda."
                : "Sesuai konfigurasi env (VITE_GATEWAY_URL / VITE_API_BASE_URL)."}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Auth API Key (untuk API Client)</CardTitle>
            <CardDescription>Setiap request ke gateway wajib menyertakan API key. API key dibuat di dashboard → API Clients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="font-medium text-foreground">Cara kirim API key (pilih salah satu):</p>
            <p>
              <strong className="text-foreground">1. Header X-API-Key</strong>
            </p>
            <pre className="rounded-lg border border-border bg-background/80 p-3 font-mono text-xs overflow-x-auto">
              X-API-Key: YOUR_API_KEY
            </pre>
            <p>
              <strong className="text-foreground">2. Authorization Bearer</strong>
            </p>
            <pre className="rounded-lg border border-border bg-background/80 p-3 font-mono text-xs overflow-x-auto">
              Authorization: Bearer YOUR_API_KEY
            </pre>
            <p className="text-muted-foreground">
              Tanpa salah satu di atas → response <strong className="text-foreground">401</strong> &quot;Missing API key&quot;.
            </p>

            <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
              <p className="font-medium text-foreground">Client Login (opsional per API key)</p>
              <p className="text-muted-foreground text-xs">
                Saat buat API key di API Clients, Anda bisa set <strong className="text-foreground">Client username</strong> dan{" "}
                <strong className="text-foreground">Client password</strong>. Jika diisi, setiap request dengan key tersebut wajib
                juga mengirim <strong className="text-foreground">Authorization: Basic</strong> dengan username dan password itu
                (base64 dari <code className="rounded bg-muted px-1">username:password</code>).
              </p>
              <p className="text-xs text-muted-foreground">
                Gunakan <strong className="text-foreground">X-API-Key</strong> untuk API key (jangan Bearer), dan header{" "}
                <strong className="text-foreground">Authorization: Basic &lt;base64&gt;</strong> untuk client login.
              </p>
              <pre className="rounded border border-border bg-muted/30 p-2 font-mono text-xs overflow-x-auto mt-2">
                X-API-Key: YOUR_API_KEY{"\n"}
                Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=
              </pre>
              <p className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1">dXNlcm5hbWU6cGFzc3dvcmQ=</code> = Base64 dari &quot;username:password&quot;.
                Jika key punya client login tapi request tidak kirim Basic → 401 &quot;This API key requires Basic Auth&quot;.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Cek API key:</strong> GET{" "}
              <code className="rounded bg-muted px-1">{BASE_URL}/gateway/verify</code> dengan header API key (dan Basic jika ada client login) → response{" "}
              <code className="rounded bg-muted px-1">{"{ \"ok\": true }"}</code> jika valid.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ContentProxy() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Endpoint Proxy</h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Path setelah <code className="rounded bg-muted px-1">/gateway/:provider</code> diteruskan ke upstream. Method
          dan body ikut diteruskan.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[280px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-foreground">Provider</th>
                <th className="px-3 py-2 text-left font-medium text-foreground">Path contoh</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-3 py-2">Gemini</td>
                <td className="px-3 py-2 font-mono text-xs">/gateway/gemini/v1beta/models</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2">Groq</td>
                <td className="px-3 py-2 font-mono text-xs">/gateway/groq/openai/v1/models</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Apify</td>
                <td className="px-3 py-2 font-mono text-xs">/gateway/apify/acts atau /gateway/apify/actor-tasks</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Cloudinary / ImageKit</td>
                <td className="px-3 py-2 font-mono text-xs">/gateway/cloudinary/... atau /gateway/imagekit/...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ContentApify() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Apify</h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Credential Apify memakai field <code className="rounded bg-muted px-1">api_token</code> di halaman Credentials.
          Setelah itu buat Gateway API key dengan allowed provider <code className="rounded bg-muted px-1">apify</code>.
        </p>
        <Card className="border-border bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Endpoint inti Apify via gateway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <pre className="rounded-lg border border-border bg-background/80 p-3 font-mono text-xs overflow-x-auto">{`GET  ${BASE_URL}/gateway/apify/acts?limit=10
GET  ${BASE_URL}/gateway/apify/actor-tasks?limit=10
POST ${BASE_URL}/gateway/apify/acts/:actorId/runs?waitForFinish=30
POST ${BASE_URL}/gateway/apify/actor-tasks/:taskId/runs?waitForFinish=30
GET  ${BASE_URL}/gateway/apify/actor-runs/:runId
GET  ${BASE_URL}/gateway/apify/datasets/:datasetId/items?limit=10&clean=1`}</pre>
            <p>
              Gunakan endpoint di bawah ini untuk memverifikasi integrasi Apify langsung dari aplikasi Anda.
            </p>
          </CardContent>
        </Card>
        <CodeCard title="List actors">
          {`curl -X GET "${BASE_URL}/gateway/apify/acts?limit=10" \\
  -H "X-API-Key: YOUR_API_KEY"`}
        </CodeCard>
        <CodeCard title="Run actor">
          {`curl -X POST "${BASE_URL}/gateway/apify/acts/john-doe~my-actor/runs?waitForFinish=30" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input":"contoh"}'`}
        </CodeCard>
        <CodeCard title="Run task">
          {`curl -X POST "${BASE_URL}/gateway/apify/actor-tasks/john-doe~my-task/runs?waitForFinish=30" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{}'`}
        </CodeCard>
        <CodeCard title="Cek status run dan dataset items">
          {`curl -X GET "${BASE_URL}/gateway/apify/actor-runs/RUN_ID" -H "X-API-Key: YOUR_API_KEY"

curl -X GET "${BASE_URL}/gateway/apify/datasets/DATASET_ID/items?limit=10&clean=1" \\
  -H "X-API-Key: YOUR_API_KEY"`}
        </CodeCard>
      </div>
    </>
  );
}

function ContentChat() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Chat API (Gemini & Groq)</h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Endpoint khusus untuk chat teks tanpa perlu memanggil path lengkap upstream. Berguna untuk integrasi cepat.
        </p>
        <p className="text-sm">
          <strong className="text-foreground">POST</strong>{" "}
          <code className="rounded bg-muted px-1">/gateway/gemini/chat</code> atau{" "}
          <code className="rounded bg-muted px-1">/gateway/groq/chat</code>
        </p>
        <p className="text-xs text-muted-foreground">Body JSON:</p>
        <pre className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-words">{`{
  "prompt": "Tuliskan cerita pendek tentang laut",
  "model_id": "gemini-2.0-flash"  // opsional
}`}</pre>
        <p className="text-xs text-muted-foreground">
          Response: <code className="rounded bg-muted px-1">{"{ \"text\": \"...\", \"model\": \"...\" }"}</code>
        </p>
      </div>
    </>
  );
}

function ContentUpload() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">
        Upload (Cloudinary & ImageKit)
      </h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">POST</strong>{" "}
          <code className="rounded bg-muted px-1">/gateway/cloudinary/upload</code> atau{" "}
          <code className="rounded bg-muted px-1">/gateway/imagekit/upload</code> dengan body{" "}
          <code className="rounded bg-muted px-1">multipart/form-data</code> (field: <code className="rounded bg-muted px-1">file</code>).
          Credential provider diambil dari dashboard (Credentials).
        </p>
        <CodeCard title="curl — upload file">
          {`curl -X POST "${BASE_URL}/gateway/cloudinary/upload" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "file=@/path/to/gambar.png"`}
        </CodeCard>
        <p className="text-xs text-muted-foreground">
          Ganti <code className="rounded bg-muted px-1">/path/to/gambar.png</code> dengan path file Anda. Untuk ImageKit
          ganti URL ke <code className="rounded bg-muted px-1">/gateway/imagekit/upload</code>.
        </p>
      </div>
    </>
  );
}

function ContentRateErrors() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Rate limit & Kode Error</h2>
      <div className="mt-4 space-y-4">
        <Card className="border-border bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Rate limit
            </CardTitle>
            <CardDescription>Per API key, per menit</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Melebihi quota → response <strong className="text-foreground">429</strong>. Allowed providers diatur per
            key; request ke provider yang tidak diizinkan → <strong className="text-foreground">403</strong>.
          </CardContent>
        </Card>
        <Card className="border-border bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4" />
              Kode HTTP umum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[260px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium text-foreground">Kode</th>
                    <th className="py-2 text-left font-medium text-foreground">Arti</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <td className="py-2 font-mono">200</td>
                    <td className="py-2">Sukses</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 font-mono">400</td>
                    <td className="py-2">Bad request / error dari provider</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 font-mono">401</td>
                    <td className="py-2">API key tidak ada atau tidak valid</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 font-mono">403</td>
                    <td className="py-2">Provider tidak diizinkan untuk key ini</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 font-mono">404</td>
                    <td className="py-2">Credential provider tidak ditemukan</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 font-mono">429</td>
                    <td className="py-2">Quota per menit terlampaui</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono">503</td>
                    <td className="py-2">Upstream/provider gagal atau tidak tersedia</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ContentPostmanTerminal() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Coba di Postman & Terminal</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Panduan singkat untuk uji API lewat Postman atau terminal (curl). Ganti <code className="rounded bg-muted px-1">YOUR_API_KEY</code> dan{" "}
        <code className="rounded bg-muted px-1">{BASE_URL}</code> sesuai lingkungan Anda.
      </p>

      <Card className="mt-6 border-border bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" />
            Postman
          </CardTitle>
          <CardDescription>Langkah uji coba di Postman</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-foreground">1. Environment (opsional)</p>
            <p className="mt-1 text-muted-foreground">
              Buat environment dengan variabel: <code className="rounded bg-muted px-1">base_url</code> ={" "}
              <code className="rounded bg-muted px-1">{BASE_URL}</code>,{" "}
              <code className="rounded bg-muted px-1">api_key</code> = API key Anda.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">2. Cek API key (GET Verify)</p>
            <p className="mt-1 text-muted-foreground">Request: GET {"{{base_url}}/gateway/verify"}</p>
            <p className="mt-1 text-muted-foreground">
              Headers: <code className="rounded bg-muted px-1">X-API-Key</code> = {"{{api_key}}"} (atau Authorization: Bearer {"{{api_key}}"}).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Jika API key punya Client username/password, tambah Auth → Type: Basic Auth, isi username & password.
            </p>
            <p className="mt-1 text-muted-foreground">Response 200: {"{ \"ok\": true }"}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">3. List models (GET)</p>
            <p className="mt-1 text-muted-foreground">
              GET {"{{base_url}}/gateway/gemini/v1beta/models"} atau {"{{base_url}}/gateway/groq/openai/v1/models"}
            </p>
            <p className="mt-1 text-muted-foreground">Header: X-API-Key = {"{{api_key}}"}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">4. Chat (POST)</p>
            <p className="mt-1 text-muted-foreground">POST {"{{base_url}}/gateway/gemini/chat"} atau /gateway/groq/chat</p>
            <p className="mt-1 text-muted-foreground">Headers: X-API-Key, Content-Type: application/json</p>
            <p className="mt-1 text-muted-foreground">Body (raw JSON): {"{ \"prompt\": \"Halo\", \"model_id\": \"gemini-2.0-flash\" }"}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">5. Upload file (POST)</p>
            <p className="mt-1 text-muted-foreground">POST {"{{base_url}}/gateway/cloudinary/upload"} atau /gateway/imagekit/upload</p>
            <p className="mt-1 text-muted-foreground">Body → form-data: key <code className="rounded bg-muted px-1">file</code>, type File, pilih file gambar.</p>
            <p className="mt-1 text-muted-foreground">Header: X-API-Key = {"{{api_key}}"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-border bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4" />
            Terminal (curl)
          </CardTitle>
          <CardDescription>Salin dan jalankan di terminal (PowerShell, CMD, atau bash)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeCard title="1. Cek API key (Verify)">
            {`curl -X GET "${BASE_URL}/gateway/verify" -H "X-API-Key: YOUR_API_KEY"`}
          </CodeCard>
          <CodeCard title="2. List models Gemini">
            {`curl -X GET "${BASE_URL}/gateway/gemini/v1beta/models" -H "X-API-Key: YOUR_API_KEY"`}
          </CodeCard>
          <CodeCard title="3. Chat Gemini">
            {`curl -X POST "${BASE_URL}/gateway/gemini/chat" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"prompt\\":\\"Halo, perkenalkan diri kamu\\"}"`}
          </CodeCard>
          <CodeCard title="4. Upload file (Cloudinary)">
            {`curl -X POST "${BASE_URL}/gateway/cloudinary/upload" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "file=@/path/to/gambar.png"`}
          </CodeCard>
          <p className="text-xs text-muted-foreground">
            Ganti <code className="rounded bg-muted px-1">/path/to/gambar.png</code> dengan path file Anda (Windows: mis. <code className="rounded bg-muted px-1">C:/Users/Anda/foto.png</code>).
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function ContentContoh() {
  return (
    <>
      <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">Contoh Kode</h2>
      <div className="mt-4">
        <Tabs defaultValue="curl" className="w-full">
          <TabsList className="flex w-full flex-wrap border border-border bg-muted/20 h-auto gap-1 p-1 sm:flex-nowrap">
            <TabsTrigger value="curl" className="flex-1 text-xs sm:text-sm">
              curl
            </TabsTrigger>
            <TabsTrigger value="n8n" className="flex-1 text-xs sm:text-sm">
              n8n
            </TabsTrigger>
            <TabsTrigger value="python" className="flex-1 text-xs sm:text-sm">
              Python
            </TabsTrigger>
            <TabsTrigger value="node" className="flex-1 text-xs sm:text-sm">
              Node.js
            </TabsTrigger>
          </TabsList>
          <TabsContent value="curl" className="mt-4 space-y-4">
            <CodeCard title="Verify API key">
              {`curl -X GET "${BASE_URL}/gateway/verify" -H "X-API-Key: YOUR_API_KEY"`}
            </CodeCard>
            <CodeCard title="Gemini — list models">
              {`curl -X GET "${BASE_URL}/gateway/gemini/v1beta/models" \\
  -H "X-API-Key: YOUR_API_KEY"`}
            </CodeCard>
            <CodeCard title="Authorization Bearer">
              {`curl -X GET "${BASE_URL}/gateway/groq/openai/v1/models" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
            </CodeCard>
            <CodeCard title="Chat (Gemini)">
              {`curl -X POST "${BASE_URL}/gateway/gemini/chat" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"Halo, perkenalkan diri kamu"}'`}
            </CodeCard>
          </TabsContent>
          <TabsContent value="n8n" className="mt-4">
            <Card className="border-border bg-muted/20">
              <CardContent className="pt-6 space-y-4 text-sm">
                <p>1. Buat node <strong>HTTP Request</strong>.</p>
                <p>
                  2. Method: GET atau POST. URL:{" "}
                  <code className="rounded bg-muted px-1 break-all">{BASE_URL}/gateway/gemini/v1beta/models</code>
                </p>
                <p>3. Authentication → Generic Credential Type:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Header Name: <code className="rounded bg-muted px-1">X-API-Key</code></li>
                  <li>Header Value: API key Anda</li>
                </ul>
                <p>
                  Atau Header Auth: <code className="rounded bg-muted px-1">Authorization</code> ={" "}
                  <code className="rounded bg-muted px-1">Bearer YOUR_API_KEY</code>.
                </p>
                <p>4. Untuk POST, isi body JSON. Gateway meneruskan ke upstream.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="python" className="mt-4">
            <CodeCard title="Python (requests)">
              {`import requests

BASE = "${BASE_URL}"
API_KEY = "your_api_key_here"

# List models (X-API-Key)
r = requests.get(
    f"{BASE}/gateway/gemini/v1beta/models",
    headers={"X-API-Key": API_KEY},
)
print(r.status_code, r.json())

# Chat (Bearer)
r = requests.post(
    f"{BASE}/gateway/gemini/chat",
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    json={"prompt": "Halo"},
)
print(r.status_code, r.json())`}
            </CodeCard>
          </TabsContent>
          <TabsContent value="node" className="mt-4">
            <CodeCard title="Node.js (fetch)">
              {`const BASE = "${BASE_URL}";
const API_KEY = "your_api_key_here";

// List models
const res = await fetch(\`\${BASE}/gateway/gemini/v1beta/models\`, {
  headers: { "X-API-Key": API_KEY },
});
const models = await res.json();
if (!res.ok) throw new Error("Gagal memuat daftar model");

// Chat
const res2 = await fetch(\`\${BASE}/gateway/gemini/chat\`, {
  method: "POST",
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ prompt: "Halo" }),
});
const chatResult = await res2.json();
if (!res2.ok) throw new Error("Permintaan chat gagal");`}
            </CodeCard>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function CodeCard({
  title,
  children,
  className,
}: {
  title: string;
  children: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-border bg-muted/20", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="rounded-lg border border-border bg-background/80 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-words">
          {children}
        </pre>
      </CardContent>
    </Card>
  );
}

export default DocsPage;
