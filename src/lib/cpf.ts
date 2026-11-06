// CPF: guardamos só os 11 dígitos; validamos os dígitos verificadores.

export const cpfDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function isValidCpf(v: string | null | undefined): boolean {
  const d = cpfDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** 12345678909 → 123.456.789-09 */
export function formatCpf(v: string | null | undefined): string {
  const d = cpfDigits(v);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v ?? "");
}

/** Formata enquanto digita: 000.000.000-00 */
export function maskCpf(ev: { currentTarget: HTMLInputElement }) {
  const el = ev.currentTarget;
  const d = el.value.replace(/\D/g, "").slice(0, 11);
  el.value = d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}
