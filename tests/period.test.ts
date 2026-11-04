import { describe, expect, it } from "vitest";
import { dayKey, greetingSP, percentChange, resolvePeriod, startOfDaySP } from "@/lib/period";

// 04/11/2026 09:15 em São Paulo = 12:15 UTC
const now = new Date("2026-11-04T12:15:00Z");

describe("períodos no fuso de São Paulo", () => {
  it("'Hoje' começa à meia-noite de São Paulo (03:00 UTC)", () => {
    const p = resolvePeriod("hoje", {}, now);
    expect(p.from.toISOString()).toBe("2026-11-04T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-11-05T03:00:00.000Z");
    expect(p.prevFrom.toISOString()).toBe("2026-11-03T03:00:00.000Z");
  });

  it("23h30 em São Paulo ainda é o mesmo dia, embora já seja o dia seguinte em UTC", () => {
    const late = new Date("2026-11-05T02:30:00Z");
    expect(dayKey(late)).toBe("2026-11-04");
    expect(startOfDaySP(late).toISOString()).toBe("2026-11-04T03:00:00.000Z");
  });

  it("últimos 7 dias incluem hoje", () => {
    const p = resolvePeriod("7d", {}, now);
    expect(dayKey(p.from)).toBe("2026-10-29");
    expect(p.to.getTime() - p.from.getTime()).toBe(7 * 86400000);
  });

  it("mês anterior e mês atual", () => {
    expect(dayKey(resolvePeriod("mes", {}, now).from)).toBe("2026-11-01");
    const prev = resolvePeriod("mes-anterior", {}, now);
    expect(dayKey(prev.from)).toBe("2026-10-01");
    expect(dayKey(new Date(prev.to.getTime() - 1))).toBe("2026-10-31");
  });

  it("período personalizado válido é respeitado; inválido cai em 30 dias", () => {
    const ok = resolvePeriod("personalizado", { de: "2026-10-10", ate: "2026-10-20" }, now);
    expect(dayKey(ok.from)).toBe("2026-10-10");
    expect(dayKey(new Date(ok.to.getTime() - 1))).toBe("2026-10-20");
    expect(resolvePeriod("personalizado", { de: "2026-10-20", ate: "2026-10-10" }, now).key).toBe("30d");
    expect(resolvePeriod("personalizado", { de: "2026-02-31", ate: "2026-03-01" }, now).key).toBe("30d");
    expect(resolvePeriod("qualquer-coisa", {}, now).key).toBe("hoje");
  });

  it("variação sem base de comparação não inventa número", () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("saudação conforme a hora em São Paulo", () => {
    expect(greetingSP(now)).toBe("Bom dia");
    expect(greetingSP(new Date("2026-11-04T17:00:00Z"))).toBe("Boa tarde");
    expect(greetingSP(new Date("2026-11-04T23:00:00Z"))).toBe("Boa noite");
  });
});
