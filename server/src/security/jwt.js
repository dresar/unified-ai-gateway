import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.jwtSecret);

export const signJwt = async (payload) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("unified-ai-gateway")
    .setAudience("unified-ai-gateway")
    .setExpirationTime("7d")
    .sign(secret);

export const verifyJwt = async (token) => {
  const { payload } = await jwtVerify(token, secret, {
    issuer: "unified-ai-gateway",
    audience: "unified-ai-gateway",
  });
  return payload;
};

