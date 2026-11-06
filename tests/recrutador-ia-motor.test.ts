// Validação do motor de pontuação "m2" com candidatos simulados.
import { describe, expect, it } from "vitest";
import { QUESTIONS } from "@/server/modules/behavioral/questionnaire";
import { CONTRADICTION_RULES, JOB_TEMPLATES, MATRIX } from "@/server/modules/behavioral/matrix";
import { scoreV2 } from "@/server/modules/behavioral/scoring-v2";

const pick = (fn: (pts: number[]) => number) => QUESTIONS.map((q) => fn(q.options.map((o) => o.points)));
const best = pick((p) => p.indexOf(Math.max(...p)));
const worst = pick((p) => p.indexOf(Math.min(...p)));
const middle = pick((p) => (p.includes(2) ? p.indexOf(2) : p.indexOf(Math.max(...p))));
const tpl = (k: string) => { const t = JOB_TEMPLATES.find((x) => x.key === k)!; return { template: t.key, name: t.name, weights: t.weights, essentials: t.essentials }; };
const MIN = 60000;

describe("matriz m2", () => {
  it("cobre as 25 perguntas, na ordem, com pontos de 0 a 3 em todas as competências avaliadas", () => {
    expect(MATRIX.map((m) => m.n)).toEqual(QUESTIONS.map((q) => q.n));
    expect(MATRIX.every((m, i) => m.primary === QUESTIONS[i].competency)).toBe(true);
    expect(MATRIX.flatMap((m) => m.secondary).every((s) => s.points.length === 4 && s.points.every((p) => p >= 0 && p <= 3))).toBe(true);
    expect(CONTRADICTION_RULES.flatMap((r) => [...r.a, ...r.b]).every((n) => n >= 1 && n <= 25)).toBe(true);
  });
});

describe("candidatos simulados", () => {
  it("consistente alto: 100 em tudo, sem contradições, confiança alta", () => {
    const r = scoreV2(best, { durationMs: 9 * MIN });
    expect(r.competencies.every((c) => c.score === 100)).toBe(true);
    expect(r.overall).toBe(100);
    expect(r.overallBand).toBe("Muito elevados");
    expect(r.contradictions).toEqual([]);
    expect(r.confidence.level).toBe("Alta");
    expect(r.attention).toEqual([]);
  });

  it("consistente baixo: notas baixas, mas a confiança da análise não cai por isso", () => {
    const r = scoreV2(worst, { durationMs: 8 * MIN });
    expect(r.overall).toBeLessThan(40);
    expect(r.overallBand).toBe("Precisam ser investigados");
    expect(r.attention).toHaveLength(8);
    expect(r.confidence.level).not.toBe("Baixa"); // confiança ≠ qualidade do candidato
    expect(r.profile).toBe("Perfil em desenvolvimento");
  });

  it("médio: notas intermediárias em todas as competências", () => {
    const r = scoreV2(middle, { durationMs: 7 * MIN });
    expect(r.overall).toBeGreaterThan(50);
    expect(r.overall).toBeLessThan(85);
  });

  it("contraditório: aponta perguntas, respostas comparadas, competência, motivo e pergunta para a entrevista", () => {
    const a = [...best];
    a[3] = 2; // P4: "Fico ansioso, mas faço na ordem" (1 ponto) com P5, P6 e P21 no máximo
    a[2] = 0; // P3: diz preferir equipe (3)…
    a[0] = 0; a[1] = 1; // …mas P1 e P2 com atitudes de baixa colaboração
    const r = scoreV2(a, { durationMs: 8 * MIN });
    const press = r.contradictions.find((c) => c.id === "pressao")!;
    expect(press).toMatchObject({ competency: "emotional", severity: "moderada", questions: [4, 5, 6, 21] });
    expect(press.compared[0]).toMatchObject({ n: 4, answer: "Fico ansioso, mas faço na ordem em que chegaram.", points: 1 });
    expect(press.why).toMatch(/não indica falta de sinceridade/);
    expect(press.interviewQuestion.length).toBeGreaterThan(20);
    expect(r.contradictions.find((c) => c.id === "equipe")!.severity).toBe("alta");
    expect(r.confidence.level).not.toBe("Alta");
    expect(JSON.stringify(r)).not.toMatch(/mentir|mentira/i);
  });

  it("rápido demais e sempre a mesma alternativa reduzem a confiança, com o motivo", () => {
    const r = scoreV2(QUESTIONS.map(() => 0), { durationMs: 90 * 1000 });
    expect(r.confidence.level).toBe("Baixa");
    expect(r.confidence.reasons.join(" ")).toMatch(/1 min 30 s/);
    expect(r.confidence.reasons.join(" ")).toMatch(/25 das 25 respostas na mesma posição/);
  });

  it("justificativas correspondem à resposta escolhida", () => {
    const r = scoreV2(middle);
    r.perQuestion.forEach((q, i) => {
      const opt = QUESTIONS[i].options[middle[i]];
      expect(q.answer).toBe(opt.text);
      expect(q.points).toBe(opt.points);
      expect(q.justification).toContain(`${opt.points} ponto`);
      expect(q.interpretation).toContain(opt.insight);
    });
  });

  it("mesma entrada = mesmo resultado", () => {
    expect(scoreV2(middle, { jobProfile: tpl("vendedor"), durationMs: 6 * MIN })).toEqual(scoreV2(middle, { jobProfile: tpl("vendedor"), durationMs: 6 * MIN }));
  });

  it("vagas diferentes: mesmas notas por competência, nota geral e compatibilidade pelos pesos de cada vaga", () => {
    // Forte em metas e comunicação, fraco em organização/responsabilidade e resolução de problemas
    const a = [...best];
    for (const q of QUESTIONS.filter((x) => x.competency === "responsibility" || x.competency === "problems")) a[q.n - 1] = worst[q.n - 1];
    const sales = scoreV2(a, { jobProfile: tpl("vendedor") });
    const admin = scoreV2(a, { jobProfile: tpl("administrativo") });
    expect(sales.competencies.map((c) => c.score)).toEqual(admin.competencies.map((c) => c.score));
    expect(sales.overall).toBeGreaterThan(admin.overall);
    expect(sales.essentials.every((e) => e.met)).toBe(true);
    expect(admin.essentials.filter((e) => !e.met).map((e) => e.key).sort()).toEqual(["problems", "responsibility"]);
    expect(admin.compatibility.level).toBe("baixa");
    expect(sales.jobProfile.name).toBe("Vendedor");
  });
});
