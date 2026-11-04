import { randomBytes } from "node:crypto";

/** "Vendedor(a) de Loja — Itajaí" → "vendedor-a-de-loja-itajai" */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/** Slug público único de vaga: título + cidade + sufixo curto aleatório. */
export function jobSlug(title: string, city: string): string {
  return `${slugify(`${title} ${city}`)}-${randomBytes(3).toString("hex")}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}
