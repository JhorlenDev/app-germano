import { app } from "./app.js";
import { migrate, pool } from "./db.js";
await migrate();
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Diagnóstico Tributário disponível na porta ${port}.`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    }),
  );
