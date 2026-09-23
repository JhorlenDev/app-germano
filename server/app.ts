import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { pool } from "./db.js";
import { digest, hashPassword, verifyPassword } from "./auth.js";
import { stateSchema } from "../shared/schema.js";
import { computeRegimes, ENGINE_VERSION } from "../shared/engine.js";
export const app = express();
const production = process.env.NODE_ENV === "production";
if (production && !process.env.APP_ORIGIN?.startsWith("https://"))
  throw new Error("APP_ORIGIN precisa ser HTTPS em produção.");
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.use(
  helmet({
    contentSecurityPolicy: production
      ? {
          directives: {
            "script-src": ["'self'"],
            "worker-src": ["'self'", "blob:"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "font-src": ["'self'"],
            "img-src": ["'self'", "data:"],
            "connect-src": ["'self'"],
            "frame-ancestors": ["'none'"],
          },
        }
      : false,
  }),
);
app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const allowed = process.env.APP_ORIGIN || "http://localhost:5173";
    if (
      req.get("origin") !== allowed ||
      req.get("x-requested-with") !== "gm-app"
    ) {
      res.status(403).json({ error: "Origem da solicitação não autorizada." });
      return;
    }
  }
  next();
});
app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
});
const loginLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde 15 minutos." },
});
const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "strict" as const,
  path: "/",
};
const dummyHash = await hashPassword(randomBytes(24).toString("hex"));
app.post("/api/auth/login", loginLimit, async (req, res) => {
  const { email, password } = z
    .object({ email: z.email(), password: z.string().min(1).max(256) })
    .parse(req.body);
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
    email.toLowerCase(),
  ]);
  const user = rows[0];
  const valid = await verifyPassword(
    password,
    user?.password_hash || dummyHash,
  );
  if (!user || !valid) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "DELETE FROM sessions WHERE expires_at < now() OR token_hash=$1",
    [digest(req.cookies.gm_session || "")],
  );
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [digest(token), user.id],
  );
  res.cookie("gm_session", token, { ...cookieOptions, maxAge: 12 * 3600000 });
  res.json({ id: user.id, name: user.name, email: user.email });
});
app.use("/api", async (req: Request, res, next) => {
  const token = req.cookies.gm_session;
  if (!token) {
    res.status(401).json({ error: "Entre na sua conta para continuar." });
    return;
  }
  const { rows } = await pool.query(
    "SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()",
    [digest(token)],
  );
  if (!rows[0]) {
    res.clearCookie("gm_session", cookieOptions);
    res.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
    return;
  }
  res.locals.user = rows[0];
  next();
});
app.get("/api/auth/me", (_req, res) => res.json(res.locals.user));
app.post("/api/auth/logout", async (req, res) => {
  await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
    digest(req.cookies.gm_session),
  ]);
  res.clearCookie("gm_session", cookieOptions);
  res.json({ ok: true });
});
const mapRecord = (row: any) => ({
  id: row.id,
  d: row.data,
  results: row.results,
  version: row.version,
  updatedAt: row.updated_at,
});
app.get("/api/clients", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id,cnpj,data->>'razaoSocial' as name,data->>'setor' as sector,results,version,updated_at FROM clients ORDER BY updated_at DESC",
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      cnpj: r.cnpj,
      name: r.name,
      sector: r.sector,
      results: r.results,
      version: r.version,
      updatedAt: r.updated_at,
    })),
  );
});
app.get("/api/clients/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { rows } = await pool.query("SELECT * FROM clients WHERE id=$1", [id]);
  if (!rows[0]) {
    res.status(404).json({ error: "Cliente não encontrado." });
    return;
  }
  res.json(mapRecord(rows[0]));
});
app.post("/api/clients", async (req, res) => {
  const d = stateSchema.parse(req.body.d),
    id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO clients(id,cnpj,data,results,updated_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [id, d.cnpj, d, computeRegimes(d), res.locals.user.id],
    );
    await client.query(
      "INSERT INTO audit_log(user_id,action,client_id) VALUES($1,'create',$2)",
      [res.locals.user.id, id],
    );
    await client.query("COMMIT");
    res.status(201).json(mapRecord(rows[0]));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.put("/api/clients/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    { d, version } = z
      .object({ d: stateSchema, version: z.number().int().positive() })
      .parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "UPDATE clients SET cnpj=$1,data=$2,results=$3,version=version+1,updated_by=$4,updated_at=now() WHERE id=$5 AND version=$6 RETURNING *",
      [d.cnpj, d, computeRegimes(d), res.locals.user.id, id, version],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error:
          "Este cadastro mudou em outra sessão. Reabra o cliente antes de salvar para não sobrescrever alterações.",
      });
      return;
    }
    await client.query(
      "INSERT INTO audit_log(user_id,action,client_id) VALUES($1,'update',$2)",
      [res.locals.user.id, id],
    );
    await client.query("COMMIT");
    res.json(mapRecord(rows[0]));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.delete("/api/clients/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    version = z.number().int().positive().parse(req.body.version);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "DELETE FROM clients WHERE id=$1 AND version=$2",
      [id, version],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "O cadastro mudou. Atualize a carteira antes de excluir.",
      });
      return;
    }
    await client.query(
      "INSERT INTO audit_log(user_id,action,client_id) VALUES($1,'delete',$2)",
      [res.locals.user.id, id],
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.get("/api/backup", async (_req, res) => {
  const { rows } = await pool.query("SELECT data FROM clients ORDER BY cnpj");
  res.json({
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    exportedAt: new Date().toISOString(),
    clients: rows.map((r) => ({ d: r.data })),
  });
});
app.post("/api/backup", async (req, res) => {
  const backup = z
    .object({
      schemaVersion: z.literal(1),
      clients: z.array(z.object({ d: stateSchema })).max(5000),
    })
    .parse(req.body);
  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    for (const { d } of backup.clients) {
      const id = randomUUID();
      const result = await client.query(
        "INSERT INTO clients(id,cnpj,data,results,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(cnpj) DO NOTHING",
        [id, d.cnpj, d, computeRegimes(d), res.locals.user.id],
      );
      if (result.rowCount) {
        inserted++;
        await client.query(
          "INSERT INTO audit_log(user_id,action,client_id) VALUES($1,'restore',$2)",
          [res.locals.user.id, id],
        );
      }
    }
    await client.query("COMMIT");
    res.json({ inserted, skipped: backup.clients.length - inserted });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Rota não encontrada." }),
);
app.use(express.static(resolve("dist"), { index: false }));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · "),
    });
    return;
  }
  if (error.code === "23505") {
    res.status(409).json({ error: "Já existe um cliente com este CNPJ." });
    return;
  }
  if (error.type === "entity.too.large") {
    res.status(413).json({ error: "O arquivo excede o limite de 20 MB." });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "JSON inválido." });
    return;
  }
  console.error("Erro na API:", error.code || error.name);
  res
    .status(500)
    .json({ error: "Não foi possível concluir a operação. Tente novamente." });
});
