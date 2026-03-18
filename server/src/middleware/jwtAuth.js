import { verifyJwt } from "../security/jwt.js";

export const jwtAuth = () => async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verifyJwt(token);
    c.set("user", { id: payload.sub, email: payload.email, displayName: payload.displayName ?? null });
    return next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
};

