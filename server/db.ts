import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(20270923)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS clients (id uuid PRIMARY KEY, cnpj text NOT NULL UNIQUE, data jsonb NOT NULL, results jsonb NOT NULL, version integer NOT NULL DEFAULT 1, updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS original_clients (id text PRIMARY KEY CHECK (id ~ '^[0-9]{14}$'), data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS original_audit_log (id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), action text NOT NULL, client_id text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS audit_log (id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), action text NOT NULL, client_id uuid, created_at timestamptz NOT NULL DEFAULT now());
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
