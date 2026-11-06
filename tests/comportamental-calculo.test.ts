// Cálculo do teste comportamental: regras fixas, ponderadas e documentadas.
import { describe, expect, it } from "vitest";
import { COMPETENCIES, QUESTIONS, WEIGHT } from "@/server/modules/behavioral/questionnaire";
import { buildAnalysis, interviewSuggestions, scoreTest, validAnswers } from "@/server/modules/behavioral/scoring";

const best = QUESTIONS.map((q) => q.options.findIndex((o) => o.points === Math.max(...q.options.map((x) => x.points))));
const worst = QUESTIONS.map((q) => q.options.findIndex((o) => o.points === Math.min(...q.options.map((x) => x.points))));

describe("questionário", () => {
  it("25 perguntas fixas, 8 competências, 4 alternativas cada e melhor resposta em posições variadas", () => {
    expect(QUESTIONS.map((q) => q.n)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(new Set(QUESTIONS.map((q) => q.competency)).size).toBe(8);
    expect(QUESTIONS.every((q) => q.options.length === 4 && q.options.some((o) => o.points === 3))).toBe(true);
    const positions = new Set(best);
    expect(positions.size).toBe(4);
    expect(QUESTIONS.filter((q) => q.kind === "self").map((q) => q.n)).toEqual([3, 9, 12, 15, 18]);
  });
});

describe("pontuação", () => {
  it("tudo no máximo = 100; tudo no mínimo fica baixo; indicador é a média das competências", () => {
    const top = scoreTest(best);
    expect(top.competencies.every((c) => c.score === 100)).toBe(true);
    expect(top.overall).toBe(100);
    expect(top.overallBand).toBe("Forte");
    const low = scoreTest(worst);
    expect(low.overall).toBeLessThan(30);
    expect(low.profile).toBe("Perfil em desenvolvimento");
    expect(low.overall).toBe(Math.round(low.competencies.reduce((s, c) => s + c.score, 0) / 8));
  });

  it("pondera autopercepção pela metade dentro da competência", () => {
    // Trabalho em equipe: Q1 e Q2 no máximo, Q3 (autopercepção) no mínimo → (3+3+0)/(3+3+1.5)
    const a = [...best];
    a[2] = worst[2];
    const team = scoreTest(a).competencies.find((c) => c.key === "team")!;
    expect(team.score).toBe(Math.round((6 / (6 + 3 * WEIGHT.self)) * 100)); // 80
    // Uma situacional no mínimo derruba mais que a autopercepção
    const b = [...best];
    b[0] = worst[0];
    expect(scoreTest(b).competencies.find((c) => c.key === "team")!.score).toBeLessThan(team.score);
  });

  it("pontos fortes, de atenção, perfil, análise e perguntas de entrevista", () => {
    const a = [...best];
    for (const q of QUESTIONS.filter((x) => x.competency === "emotional" || x.competency === "adaptability")) a[q.n - 1] = worst[q.n - 1];
    const r = scoreTest(a);
    expect(r.attention.sort()).toEqual(["adaptability", "emotional"]);
    expect(r.strengths).toHaveLength(3);
    expect(r.profile).toBe("Colaborativo e orientado a resultados");
    const an = buildAnalysis("Ana", a, r);
    expect(an.intro).toContain("Ana obteve indicador geral de");
    expect(an.byCompetency.find((c) => c.key === "emotional")!.text).toContain("pode responder no mesmo tom");
    expect(interviewSuggestions(r).map((s) => s.name).sort()).toEqual(["Adaptabilidade", "Controle emocional"]);
    expect(COMPETENCIES).toHaveLength(8);
  });

  it("recusa respostas incompletas ou fora do intervalo", () => {
    expect(validAnswers(best.slice(1))).toBe(false);
    expect(validAnswers([...best.slice(1), 4])).toBe(false);
    expect(() => scoreTest(best.slice(2))).toThrow();
  });
});
