import "server-only";
import { AppError } from "@/server/errors";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Segredos guardados no banco (tokens da Meta) são cifrados com AES-256-GCM.
// A chave fica só na variável de ambiente ENCRYPTION_KEY (32 bytes em base64), nunca no banco nem no código.

export class MissingKeyError extends AppError {
  constructor() {
    super("INTERNAL", "A chave de criptografia (ENCRYPTION_KEY) não está configurada no servidor. Peça ao administrador técnico para configurá-la.");
  }
}

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new MissingKeyError();
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY deve ter 32 bytes em base64.");
  return k;
}

export function encryptionReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, data] = blob.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato inválido.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

export const sha256Hex = (v: string) => createHash("sha256").update(v).digest("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
