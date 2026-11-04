const TZ = "America/Sao_Paulo";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ });

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateTime.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateOnly.format(typeof d === "string" ? new Date(d) : d);
}
