import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const key = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
