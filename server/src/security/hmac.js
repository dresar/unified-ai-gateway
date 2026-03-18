import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const signHmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");

export const safeEqualHex = (a, b) => {
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
};
