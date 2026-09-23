import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, migrate } from "./db.js";
import { hashPassword } from "./auth.js";
const input = z
  .object({
    name: z.string().min(2),
    email: z.email(),
    password: z.string().min(12),
  })
  .parse({
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
try {
  await migrate();
  await pool.query(
    "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
    [
      randomUUID(),
      input.name,
      input.email.toLowerCase(),
      await hashPassword(input.password),
    ],
  );
  console.log(
    "Usuário criado. Remova ADMIN_PASSWORD do ambiente após o cadastro.",
  );
} catch (error: any) {
  console.error(
    error.code === "23505"
      ? "Este e-mail já está cadastrado."
      : "Não foi possível criar o usuário. Verifique os parâmetros e a conexão.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
