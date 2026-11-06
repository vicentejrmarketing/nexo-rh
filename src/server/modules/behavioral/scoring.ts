// Cálculo do resultado do teste comportamental (puro: mesmas respostas, mesmo resultado).
import { COMPETENCIES, INTERVIEW_QUESTIONS, QUESTIONS, WEIGHT, bandOf, type CompetencyKey } from "./questionnaire";

export type CompetencyScore = { key: CompetencyKey; name: string; score: number; band: string };

export type TestResult = {
  version: string;
  competencies: CompetencyScore[];
  overall: number;
  overallBand: string;
  profile: string;
  strengths: CompetencyKey[];
  attention: CompetencyKey[];
};

/** answers[i] = índice (0–3) da alternativa escolhida na pergunta i+1. */
export function validAnswers(answers: unknown): answers is number[] {
  return Array.isArray(answers) && answers.length === QUESTIONS.length && answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3);
}

export function scoreTest(answers: number[], version = "v1"): TestResult {
  if (!validAnswers(answers)) throw new Error("Respostas incompletas.");
  const got = new Map<CompetencyKey, number>();
  const max = new Map<CompetencyKey, number>();
  QUESTIONS.forEach((q, i) => {
    const w = WEIGHT[q.kind];
    got.set(q.competency, (got.get(q.competency) ?? 0) + q.options[answers[i]].points * w);
    max.set(q.competency, (max.get(q.competency) ?? 0) + 3 * w);
  });
  const competencies = COMPETENCIES.map((c) => {
    const score = Math.round(((got.get(c.key) ?? 0) / (max.get(c.key) ?? 1)) * 100);
    return { key: c.key, name: c.name, score, band: bandOf(score).label };
  });
  const overall = Math.round(competencies.reduce((s, c) => s + c.score, 0) / competencies.length);

  // Ordem estável: nota, depois a ordem do questionário (desempate previsível).
  const ranked = [...competencies].sort((a, b) => b.score - a.score || COMPETENCIES.findIndex((c) => c.key === a.key) - COMPETENCIES.findIndex((c) => c.key === b.key));
  const strengths = ranked.filter((c) => c.score >= 70).slice(0, 3).map((c) => c.key);
  let attention = ranked.filter((c) => c.score < 60).reverse().map((c) => c.key);
  // Sem nenhuma abaixo de 60, as duas mais baixas ainda merecem uma pergunta na entrevista.
  if (!attention.length) attention = ranked.slice(-2).reverse().filter((c) => c.score < 80).map((c) => c.key);

  const trait = (k: CompetencyKey) => COMPETENCIES.find((c) => c.key === k)!.trait;
  const profile = overall < 45
    ? "Perfil em desenvolvimento"
    : `${trait(ranked[0].key)} e ${trait(ranked[1].key).toLowerCase()}`;

  return { version, competencies, overall, overallBand: bandOf(overall).label, profile, strengths, attention };
}

const joinPt = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`);

/** Texto da análise, montado a partir das alternativas escolhidas. */
export function buildAnalysis(firstName: string, answers: number[], r: TestResult) {
  const name = (k: CompetencyKey) => COMPETENCIES.find((c) => c.key === k)!.name.toLowerCase();
  const intro =
    `${firstName} obteve indicador geral de ${r.overall} (${r.overallBand.toLowerCase()}), com perfil ${r.profile.toLowerCase()}. ` +
    (r.strengths.length ? `Os resultados mais altos foram em ${joinPt(r.strengths.map(name))}. ` : "Nenhuma competência atingiu 70 pontos. ") +
    (r.attention.length ? `Vale aprofundar na entrevista: ${joinPt(r.attention.map(name))}.` : "Nenhuma competência ficou em faixa de atenção.");
  const byCompetency = COMPETENCIES.map((c) => {
    const picks = QUESTIONS.map((q, i) => ({ q, o: q.options[answers[i]] })).filter((x) => x.q.competency === c.key);
    const score = r.competencies.find((x) => x.key === c.key)!;
    const text = `Nas situações apresentadas, ${joinPt(picks.map((p) => p.o.insight))}.`;
    return { key: c.key, name: c.name, score: score.score, band: score.band, text };
  });
  return { intro, byCompetency };
}

export function interviewSuggestions(r: TestResult) {
  return r.attention.map((k) => ({ key: k, name: COMPETENCIES.find((c) => c.key === k)!.name, questions: INTERVIEW_QUESTIONS[k] }));
}
