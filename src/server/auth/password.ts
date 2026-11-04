import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

// Argon2id com parâmetros recomendados pela OWASP (19 MiB, 2 iterações).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar quais contas existem.
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(await dummyHash, password);
}

/** Regras de senha: mínimo 10 caracteres, com letras e números. Devolve a lista de problemas. */
export function passwordProblems(password: string, context: { email?: string; name?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < 10) problems.push("Use pelo menos 10 caracteres.");
  if (password.length > 128) problems.push("Use no máximo 128 caracteres.");
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) problems.push("Combine letras e números.");
  const lower = password.toLowerCase();
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push("Não use o seu e-mail na senha.");
  if (/^(.)\1+$/.test(password)) problems.push("Evite repetir o mesmo caractere.");
  return problems;
}

/** Senha temporária legível (sem caracteres ambíguos), exibida uma única vez ao administrador. */
export function generateTemporaryPassword(): string {
  // 56 símbolos; 248 é múltiplo de 56, então descartar bytes >= 224 evita viés.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  for (;;) {
    let out = "";
    while (out.length < 12) {
      for (const b of randomBytes(16)) {
        if (b < 224 && out.length < 12) out += alphabet[b % alphabet.length];
      }
    }
    const candidate = `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
    if (/[A-Za-z]/.test(candidate) && /\d/.test(candidate)) return candidate;
  }
}
