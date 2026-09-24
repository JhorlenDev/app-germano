// Requires the gm-tributario-original:local image, Docker, OpenSSL and the local .env database.
// Runs the same real-browser suite through HTTPS against the production container.
import { loadEnvFile } from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import https from "node:https";
import http from "node:http";
loadEnvFile(".env");
const dir = await mkdtemp(join(tmpdir(), "gm-https-"));
const name = `gm-original-test-${process.pid}`;
const origin = "https://localhost:5186";
let proxy;
try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-subj",
      "/CN=localhost",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      name,
      "--network",
      "host",
      "-e",
      "DATABASE_URL",
      "-e",
      `APP_ORIGIN=${origin}`,
      "-e",
      "NODE_ENV=production",
      "-e",
      "TRUST_PROXY=1",
      "-e",
      "HOST=127.0.0.1",
      "-e",
      "PORT=5185",
      "gm-tributario-original:local",
    ],
    { stdio: "pipe", env: process.env },
  );
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch("http://127.0.0.1:5185/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error("Container de produção não ficou disponível.");
  proxy = https.createServer(
    {
      key: await readFile(join(dir, "key.pem")),
      cert: await readFile(join(dir, "cert.pem")),
    },
    (req, res) => {
      const upstream = http.request(
        {
          host: "127.0.0.1",
          port: 5185,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            "x-forwarded-proto": "https",
            "x-forwarded-for": "127.0.0.1",
          },
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    },
  );
  await new Promise((r) => proxy.listen(5186, "127.0.0.1", r));
  const child = spawn(process.execPath, ["tests/original-backend.mjs"], {
    stdio: "inherit",
    env: { ...process.env, TEST_ORIGIN: origin, TEST_TLS_INSECURE: "1" },
  });
  const code = await new Promise((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  if (code !== 0) throw new Error(`Teste HTTPS falhou: ${code}`);
  if (process.env.TEST_REAL_PDF === "1") {
    const pdfTest = spawn(process.execPath, ["tests/audit-original-pdfs.mjs"], {
      stdio: "inherit",
      env: { ...process.env, TEST_ORIGIN: origin, TEST_TLS_INSECURE: "1" },
    });
    const pdfCode = await new Promise((resolve, reject) => {
      pdfTest.on("exit", resolve);
      pdfTest.on("error", reject);
    });
    if (pdfCode !== 0) throw new Error("Leitura de PDF em produção falhou.");
  }
  console.log(
    "PASS: imagem Docker de produção, usuário node, PostgreSQL e proxy HTTPS.",
  );
} finally {
  proxy?.closeAllConnections();
  if (proxy) await new Promise((r) => proxy.close(r));
  try {
    execFileSync("docker", ["stop", name], { stdio: "ignore" });
  } catch {}
  await rm(dir, { recursive: true, force: true });
}
