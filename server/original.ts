import { Router } from 'express';
import { z } from 'zod';
import { pool } from './db.js';

export const originalRouter = Router();
const idSchema = z.string().regex(/^\d{14}$/);
// Preserve the original document, including its calculated results and six periods.
// This API handles persistence only; it does not run the modern calculation engine.
const recordSchema = z.object({
  id: idSchema,
  cnpj: z.string().max(32),
  razaoSocial: z.string().max(1000),
  anexo: z.string().max(80).nullable().optional(),
  d: z.object({
    cnpj: z.string().max(32),
    razaoSocial: z.string().max(1000),
    setor: z.enum(['comercio', 'industria', 'servicos']),
    cnpjMestreLocked: z.boolean(),
    uf: z.string().max(2), municipioUF: z.string().max(500),
    faturamentoMensal: z.number(), rbt12: z.number(), comprasMensais: z.number(),
    pctFornecedorRegimeNormal: z.number(), folhaMensal: z.number(), proLabore: z.number(),
    aliquotaEstMun: z.number(), pctB2B: z.number(),
    ncmDetalhado: z.array(z.record(z.string(), z.unknown())),
    historico: z.array(z.object({ faturamento: z.number(), comprasRegimeNormal: z.number(), folha: z.number() }).passthrough()).length(6),
    historicoCompetencias: z.array(z.string().nullable()).length(6),
    beneficios: z.object({ comercio: z.record(z.string(), z.unknown()), servicos: z.record(z.string(), z.unknown()) }).passthrough(),
  }).passthrough(),
}).passthrough().refine(r => r.cnpj.replace(/\D/g, '') === r.id && r.d.cnpj.replace(/\D/g, '') === r.id, 'CNPJ não corresponde ao cadastro.');
const mapRow = (r: any) => ({ record: r.data, version: r.version, updatedAt: r.updated_at });
originalRouter.get('/clients', async (_req, res) => {
  const { rows } = await pool.query('SELECT data,version,updated_at FROM original_clients ORDER BY updated_at DESC,id');
  res.json(rows.map(mapRow));
});
originalRouter.put('/clients/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { record, version } = z.object({ record: recordSchema, version: z.number().int().nonnegative() }).parse(req.body);
  if (record.id !== id) { res.status(400).json({ error: 'Identificador divergente.' }); return; }
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows } = version === 0
      ? await conn.query('INSERT INTO original_clients(id,data,updated_by) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING *', [id, record, res.locals.user.id])
      : await conn.query('UPDATE original_clients SET data=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 AND version=$4 RETURNING *', [id, record, res.locals.user.id, version]);
    if (!rows[0]) {
      await conn.query('ROLLBACK');
      res.status(409).json({ error: 'Este cliente já existe ou mudou em outra sessão. Selecione-o novamente na carteira antes de editar.' });
      return;
    }
    await conn.query('INSERT INTO original_audit_log(user_id,action,client_id) VALUES($1,$2,$3)', [res.locals.user.id, version ? 'update' : 'create', id]);
    await conn.query('COMMIT');
    res.status(version ? 200 : 201).json(mapRow(rows[0]));
  } catch (error) { await conn.query('ROLLBACK'); throw error; }
  finally { conn.release(); }
});
originalRouter.delete('/clients/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const version = z.number().int().positive().parse(req.body.version);
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const result = await conn.query('DELETE FROM original_clients WHERE id=$1 AND version=$2', [id, version]);
    if (!result.rowCount) {
      await conn.query('ROLLBACK');
      res.status(409).json({ error: 'O cadastro mudou. Selecione o cliente novamente antes de excluir.' });
      return;
    }
    await conn.query('INSERT INTO original_audit_log(user_id,action,client_id) VALUES($1,\'delete\',$2)', [res.locals.user.id, id]);
    await conn.query('COMMIT');
    res.json({ ok: true });
  } catch (error) { await conn.query('ROLLBACK'); throw error; }
  finally { conn.release(); }
});
