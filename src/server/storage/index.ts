import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Armazenamento privado de arquivos (currículos).
// - "supabase": bucket privado do Supabase Storage; acesso só por link assinado de curta duração.
// - "local": pasta no disco, para desenvolvimento e testes.
// Nenhum arquivo é público: a rota /api/files/[id] confere a permissão antes de entregar.

export const MAX_RESUME_BYTES = 4 * 1024 * 1024; // limite de envio das funções da Vercel é 4,5 MB

type Driver = {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** URL temporária para download (supabase) ou null quando o arquivo é servido pela própria rota (local). */
  signedUrl(key: string, seconds: number, downloadName: string): Promise<string | null>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
};

const BUCKET = process.env.STORAGE_BUCKET ?? "curriculos";

function supabaseDriver(): Driver | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const headers = { Authorization: `Bearer ${key}`, apikey: key };
  const objectUrl = (k: string) => `${url}/storage/v1/object/${BUCKET}/${k.split("/").map(encodeURIComponent).join("/")}`;
  const check = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`Armazenamento: falha ao ${what} (${res.status})`);
    return res;
  };
  return {
    async put(k, data, contentType) {
      await check(
        await fetch(objectUrl(k), { method: "POST", headers: { ...headers, "Content-Type": contentType, "x-upsert": "false" }, body: new Uint8Array(data) }),
        "enviar o arquivo",
      );
    },
    async signedUrl(k, seconds, downloadName) {
      const res = await check(
        await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${k.split("/").map(encodeURIComponent).join("/")}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: seconds }),
        }),
        "gerar o link",
      );
      const { signedURL } = (await res.json()) as { signedURL: string };
      return `${url}/storage/v1${signedURL}&download=${encodeURIComponent(downloadName)}`;
    },
    async read(k) {
      const res = await check(await fetch(`${url}/storage/v1/object/authenticated/${BUCKET}/${k}`, { headers }), "ler o arquivo");
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(k) {
      await check(
        await fetch(`${url}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [k] }) }),
        "excluir o arquivo",
      );
    },
  };
}

function localDriver(): Driver {
  // Só para desenvolvimento/testes; os comentários evitam que o bundler inclua o projeto inteiro no deploy.
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_STORAGE_DIR ?? ".storage");
  const full = (k: string) => {
    const p = path.resolve(/*turbopackIgnore: true*/ root, k);
    if (!p.startsWith(root + path.sep)) throw new Error("Caminho inválido");
    return p;
  };
  return {
    async put(k, data) {
      await mkdir(/*turbopackIgnore: true*/ path.dirname(full(k)), { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ full(k), data, { flag: "wx" });
    },
    async signedUrl() {
      return null;
    },
    read: (k) => readFile(/*turbopackIgnore: true*/ full(k)),
    remove: (k) => rm(/*turbopackIgnore: true*/ full(k), { force: true }),
  };
}

let cached: Driver | null | undefined;
export function storage(): Driver | null {
  if (cached !== undefined) return cached;
  const mode = process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "supabase" : "local");
  cached = mode === "local" ? localDriver() : supabaseDriver();
  return cached;
}

export function storageReady(): boolean {
  return storage() !== null;
}

/** Confere que o arquivo é mesmo um PDF (assinatura %PDF-), não só pela extensão. */
export function validatePdf(data: Buffer): string | null {
  if (data.length === 0) return "O arquivo está vazio.";
  if (data.length > MAX_RESUME_BYTES) return "O currículo deve ter no máximo 4 MB.";
  if (data.subarray(0, 5).toString("latin1") !== "%PDF-") return "Envie o currículo em PDF.";
  // PDFs com JavaScript embutido são recusados: um currículo não precisa disso.
  const sample = data.subarray(0, Math.min(data.length, 2 * 1024 * 1024)).toString("latin1");
  if (/\/JavaScript|\/JS\s*[(<]|\/Launch/.test(sample)) return "Este PDF contém conteúdo executável e foi recusado.";
  return null;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
