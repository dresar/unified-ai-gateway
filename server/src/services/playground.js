/**
 * Playground: proxy chat ke Gemini (Google) dan Groq. Upload ke Cloudinary/ImageKit.
 * Tidak ada integrasi OpenAI — hanya Google Gemini API dan Groq API.
 * Credential diambil dari provider_credentials (user).
 * Cloudinary: pakai SDK resmi (cloudinary) agar signature benar.
 */

import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import cloudinaryPkg from "cloudinary";
import { getDefaultModelId, getModelSupportsVision, getVisionModelId, isModelAllowed } from "./aiModels.js";

const cloudinary = cloudinaryPkg.v2;

/** Generate short random public_id untuk Cloudinary (alfanumerik kecil, 10 karakter). */
function shortPublicId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  const bytes = randomBytes(10);
  for (let i = 0; i < 10; i++) id += chars[bytes[i] % chars.length];
  return id;
}

/** Ubah full Cloudinary URL jadi path singkat: cloud_name/image/upload/version/folder/file (tanpa host). */
function shortenCloudinaryUrl(fullUrl) {
  if (typeof fullUrl !== "string") return fullUrl;
  const prefix = "https://res.cloudinary.com/";
  if (fullUrl.startsWith(prefix)) return fullUrl.slice(prefix.length);
  return fullUrl;
}

/** Instruksi agar jawaban tidak pakai simbol * atau **; pakai angka 1, 2, 3 untuk daftar. */
const NO_SYMBOL_SYSTEM_INSTRUCTION =
  "Aturan format jawaban: Jangan gunakan simbol asterisk (*) atau ** untuk bullet maupun bold. Untuk daftar/poin gunakan angka saja: 1, 2, 3, 4, dst. Tulis dalam teks biasa tanpa markdown atau simbol pemformat.";

/** Sanitasi jawaban AI: hapus semua asterisk/bullet/underscore maskir agar output pakai angka/teks saja. */
function sanitizeAiAnswer(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/\*+/g, "")
    .replace(/•+/g, "")
    .replace(/\u2022+/g, "")
    .replace(/_{3,}/g, "");
}

export async function chatWithProvider({ db }, { userId, credentialId, prompt, imageBase64, modelId }) {
  const { rows } = await db.query(
    "select id, provider_name, credentials from public.provider_credentials where id = $1 and user_id = $2 and status = 'active' limit 1",
    [credentialId, userId]
  );
  if (!rows[0]) return { error: "Credential not found or inactive" };
  const cred = rows[0];
  const credentials = typeof cred.credentials === "object" ? cred.credentials : (cred.credentials ? JSON.parse(cred.credentials) : {});
  const provider = (cred.provider_name || "").toLowerCase();

  let resolvedModelId = modelId?.trim() || null;
  if (!resolvedModelId) resolvedModelId = await getDefaultModelId(db, provider);
  if (!resolvedModelId) return { error: "Model tidak tersedia. Pilih model dari daftar." };
  const allowed = await isModelAllowed(db, provider, resolvedModelId);
  if (!allowed) return { error: "Model tidak tersedia. Pilih model dari daftar." };

  if (provider === "gemini") {
    const apiKey = credentials.api_key ?? credentials.apiKey;
    if (!apiKey) return { error: "Gemini API key not set in credential" };
    const model = resolvedModelId;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const parts = [{ text: prompt || "Hello" }];
    if (imageBase64 && imageBase64.length > 0) {
      parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        },
      });
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        systemInstruction: { parts: [{ text: NO_SYMBOL_SYSTEM_INSTRUCTION }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || "Gemini API error", raw: data };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const text = sanitizeAiAnswer(rawText);
    return { text, model: model };
  }

  if (provider === "groq") {
    const apiKey = credentials.api_key ?? credentials.apiKey;
    if (!apiKey) return { error: "Groq API key not set in credential" };
    let groqModel = resolvedModelId;
    const hasImage = imageBase64 && imageBase64.length > 0;
    if (hasImage) {
      const supportsVision = await getModelSupportsVision(db, provider, groqModel);
      if (!supportsVision) {
        const visionModel = await getVisionModelId(db, provider);
        groqModel = visionModel || groqModel;
      }
    }
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const content = [{ type: "text", text: prompt || "Hello" }];
    if (hasImage) {
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: "system", content: NO_SYMBOL_SYSTEM_INSTRUCTION },
          { role: "user", content },
        ],
        max_tokens: 2048,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || "Groq API error", raw: data };
    const rawText = data.choices?.[0]?.message?.content ?? "";
    const text = sanitizeAiAnswer(rawText);
    return { text, model: data.model };
  }

  return { error: "Unsupported provider for chat. Use Gemini or Groq." };
}

export async function uploadToCloud({ db }, { userId, credentialId, provider, buffer, mimeType, originalName }) {
  const { rows } = await db.query(
    "select id, provider_name, credentials from public.provider_credentials where id = $1 and user_id = $2 and status = 'active' limit 1",
    [credentialId, userId]
  );
  if (!rows[0]) return { error: "Credential not found or inactive" };
  const cred = rows[0];
  const credentials = typeof cred.credentials === "object" ? cred.credentials : (cred.credentials ? JSON.parse(cred.credentials) : {});
  const prov = (cred.provider_name || "").toLowerCase();

  if (prov === "cloudinary") {
    const cloudName = (credentials.cloud_name ?? credentials.cloudName ?? "").toString().trim();
    const apiKey = (credentials.api_key ?? credentials.apiKey ?? "").toString().trim();
    const apiSecret = (credentials.api_secret ?? credentials.apiSecret ?? "").toString().trim();
    if (!cloudName || !apiKey || !apiSecret) return { error: "Cloudinary credential incomplete (cloud_name, api_key, api_secret)" };

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    const publicId = shortPublicId();
    const result = await new Promise((resolve) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "playground", public_id: publicId },
        (err, res) => {
          if (err) return resolve({ error: err.message || String(err) || "Cloudinary upload failed", raw: err });
          resolve({ ok: true, data: res });
        },
      );
      uploadStream.on("error", (e) => resolve({ error: e.message || "Cloudinary stream error", raw: e }));
      Readable.from(buffer).pipe(uploadStream);
    });

    if (result.error) return { error: result.error, raw: result.raw };
    const data = result.data;
    const shortUrl = shortenCloudinaryUrl(data.secure_url);
    return {
      url: shortUrl,
      cdn_url: shortUrl,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
      format: data.format,
      external_id: data.public_id,
    };
  }

  if (prov === "imagekit") {
    const publicKey = (credentials.public_key ?? "").toString().trim();
    const privateKey = (credentials.private_key ?? "").toString().trim();
    const urlEndpoint = (credentials.url_endpoint ?? "").toString().trim();
    if (!publicKey || !privateKey || !urlEndpoint) return { error: "ImageKit credential incomplete" };
    const crypto = await import("node:crypto");
    // ImageKit (resmi SDK): signature = HMAC-SHA1(privateKey, token + expire). Token = unik (bukan nilai expire).
    const expire = Math.floor(Date.now() / 1000) + 30 * 60; // 30 menit
    const token = randomBytes(16).toString("hex");
    const toSign = token + String(expire);
    const signature = crypto.createHmac("sha1", privateKey).update(toSign).digest("hex");
    const fileName = (originalName || "upload").trim() || "upload";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), fileName);
    form.append("fileName", fileName);
    form.append("publicKey", publicKey);
    form.append("signature", signature);
    form.append("token", token);
    form.append("expire", String(expire));
    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) return { error: data.message || "ImageKit upload failed", raw: data };
    const cdnUrl = data.url || (urlEndpoint && data.filePath ? `${urlEndpoint.replace(/\/$/, "")}/${data.filePath}` : null);
    const externalId = data.fileId ?? data.filePath ?? null;
    return {
      url: data.url,
      cdn_url: cdnUrl || data.url,
      width: data.width,
      height: data.height,
      size: data.size,
      external_id: externalId,
    };
  }

  return { error: "Unsupported provider for upload. Use Cloudinary or ImageKit." };
}

/**
 * Hapus file di Cloudinary/ImageKit (untuk cleanup upload yang sudah expired).
 * @param {{ db }} ctx
 * @param {{ credentialId: string, userId: string, provider: string, externalId: string }} opts
 */
export async function deleteFromCloud(ctx, { credentialId, userId, provider, externalId }) {
  if (!externalId) return { error: "external_id required" };
  const { rows } = await ctx.db.query(
    "select id, provider_name, credentials from public.provider_credentials where id = $1 and user_id = $2 and status = 'active' limit 1",
    [credentialId, userId]
  );
  if (!rows[0]) return { error: "Credential not found" };
  const cred = rows[0];
  const credentials = typeof cred.credentials === "object" ? cred.credentials : (cred.credentials ? JSON.parse(cred.credentials) : {});
  const prov = (cred.provider_name || "").toLowerCase();

  if (prov === "cloudinary") {
    const cloudName = (credentials.cloud_name ?? credentials.cloudName ?? "").toString().trim();
    const apiKey = (credentials.api_key ?? credentials.apiKey ?? "").toString().trim();
    const apiSecret = (credentials.api_secret ?? credentials.apiSecret ?? "").toString().trim();
    if (!cloudName || !apiKey || !apiSecret) return { error: "Cloudinary credential incomplete" };
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    return new Promise((resolve) => {
      cloudinary.uploader.destroy(externalId, { invalidate: true }, (err, res) => {
        if (err) return resolve({ error: err.message || String(err) });
        resolve({ ok: true, result: res });
      });
    });
  }

  if (prov === "imagekit") {
    const privateKey = credentials.private_key;
    if (!privateKey) return { error: "ImageKit private_key required" };
    const auth = Buffer.from(`${privateKey}:`).toString("base64");
    const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: text || `ImageKit delete failed: ${res.status}` };
    }
    return { ok: true };
  }

  return { error: "Unsupported provider for delete" };
}
