// Telefones no formato internacional E.164 (+55DDNNNNNNNNN), usado na busca, na detecção
// de duplicidade e, na Etapa 4, no WhatsApp.

export function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

/** Normaliza para E.164. Aceita números brasileiros com ou sem DDI. Retorna null se inválido. */
export function toE164BR(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  let d = digitsOnly(trimmed);
  if (!d) return null;
  if (trimmed.startsWith("+") && !d.startsWith("55")) {
    // Número estrangeiro: mantém como veio, se tiver tamanho plausível.
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  if (d.startsWith("0")) d = d.replace(/^0+/, ""); // ex.: 0 47 99999-0000
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return `+${d}`;
}

/** Formato de exibição: +55 (47) 99999-0000. */
export function formatPhoneBR(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = digitsOnly(e164);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const head = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    return `(${ddd}) ${head}-${rest.slice(head.length)}`;
  }
  return e164;
}
