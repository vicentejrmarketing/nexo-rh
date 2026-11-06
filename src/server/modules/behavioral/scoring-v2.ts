// Motor de pontuação "m2" (puro e determinístico): mesmas respostas + mesma matriz + mesmos pesos
// = mesmo resultado. A IA nunca altera estes números; ela só interpreta.
import { COMPETENCIES, QUESTIONS, type CompetencyKey } from "./questionnaire";
import {
  CONTRADICTION_RULES, DEFAULT_PROFILE, MATRIX, MATRIX_VERSION, MATRIX_WEIGHT, assertMatrix, bandV2, type Essential, type JobWeights,
} from "./matrix";
import { validAnswers } from "./scoring";

export type JobProfileSnapshot = { template: string; name: string; weights: JobWeights; essentials: Essential[] };

export type QuestionAnalysis = {
  n: number;
  competency: CompetencyKey;
  kind: "situational" | "self";
  question: string;
  answerLetter: string;
  answer: string;
  points: number; // na competência principal (0–3)
  secondary: { competency: CompetencyKey; points: number }[];
  interpretation: string; // base da matriz (a IA pode aprofundar)
  justification: string;
};

export type Contradiction = {
  id: string;
  title: string;
  competency: CompetencyKey;
  severity: "alta" | "moderada";
  questions: number[];
  compared: { n: number; answer: string; points: number }[];
  why: string;
  interviewQuestion: string;
};

export type Confidence = { level: "Alta" | "Moderada" | "Baixa"; score: number; reasons: string[] };

export type ResultV2 = {
  kind: "m2";
  questionnaireVersion: string;
  matrixVersion: string;
  jobProfile: JobProfileSnapshot;
  competencies: { key: CompetencyKey; name: string; score: number; band: string; weight: number }[];
  overall: number; // ponderada pelos pesos da vaga
  overallEqual: number; // pesos iguais (referência)
  overallBand: string;
  perQuestion: QuestionAnalysis[];
  contradictions: Contradiction[];
  confidence: Confidence;
  strengths: CompetencyKey[];
  attention: CompetencyKey[];
  essentials: { key: CompetencyKey; min: number; score: number; met: boolean }[];
  compatibility: { level: "alta" | "parcial" | "baixa"; label: string };
  // Resultado no formato antigo, para telas e listas que leem `profile`/`overall`.
  profile: string;
};

const LETTERS = ["A", "B", "C", "D"];
const name = (k: CompetencyKey) => COMPETENCIES.find((c) => c.key === k)!.name;
const LEVEL: Record<number, string> = {
  3: "3 pontos: comportamento mais alinhado ao esperado no trabalho",
  2: "2 pontos: comportamento adequado, com alguma ressalva",
  1: "1 ponto: comportamento pouco efetivo ou dependente de terceiros",
  0: "0 ponto: comportamento que tende a gerar problema no dia a dia",
};

export function normalizeWeights(w: Partial<JobWeights> | null | undefined): JobWeights {
  return Object.fromEntries(COMPETENCIES.map((c) => {
    const v = Number(w?.[c.key]);
    return [c.key, Number.isFinite(v) && v >= 0 && v <= 3 ? v : 1];
  })) as JobWeights;
}

export function scoreV2(
  answers: number[],
  opts: { jobProfile?: JobProfileSnapshot | null; durationMs?: number | null; questionnaireVersion?: string } = {},
): ResultV2 {
  assertMatrix();
  if (!validAnswers(answers)) throw new Error("Respostas incompletas.");
  const profile = opts.jobProfile ?? DEFAULT_PROFILE;
  const weights = normalizeWeights(profile.weights);

  // 1) Pontos por competência (principal + secundárias)
  const got = new Map<CompetencyKey, number>();
  const max = new Map<CompetencyKey, number>();
  const add = (k: CompetencyKey, pts: number, w: number) => {
    got.set(k, (got.get(k) ?? 0) + pts * w);
    max.set(k, (max.get(k) ?? 0) + 3 * w);
  };
  const perQuestion: QuestionAnalysis[] = QUESTIONS.map((q, i) => {
    const m = MATRIX[i];
    const a = answers[i];
    const opt = q.options[a];
    add(q.competency, opt.points, q.kind === "self" ? MATRIX_WEIGHT.primarySelf : MATRIX_WEIGHT.primarySituational);
    const secondary = m.secondary.map((s) => {
      add(s.competency, s.points[a], MATRIX_WEIGHT.secondary);
      return { competency: s.competency, points: s.points[a] };
    });
    return {
      n: q.n, competency: q.competency, kind: q.kind, question: q.text, answerLetter: LETTERS[a], answer: opt.text, points: opt.points, secondary,
      interpretation: `O candidato ${opt.insight}.`,
      justification: `${LEVEL[opt.points]} em ${name(q.competency).toLowerCase()}${q.kind === "self" ? " (autopercepção, peso 0,5)" : ""}.`,
    };
  });
  const competencies = COMPETENCIES.map((c) => {
    const score = Math.round(((got.get(c.key) ?? 0) / (max.get(c.key) ?? 1)) * 100);
    return { key: c.key, name: c.name, score, band: bandV2(score).label, weight: weights[c.key] };
  });
  const totalW = competencies.reduce((s, c) => s + c.weight, 0) || 1;
  const overall = Math.round(competencies.reduce((s, c) => s + c.score * c.weight, 0) / totalW);
  const overallEqual = Math.round(competencies.reduce((s, c) => s + c.score, 0) / competencies.length);

  // 2) Contradições (regras fixas)
  const pts = (n: number) => QUESTIONS[n - 1].options[answers[n - 1]].points;
  const mean = (ns: number[]) => ns.reduce((s, n) => s + pts(n), 0) / ns.length;
  const contradictions: Contradiction[] = [];
  for (const r of CONTRADICTION_RULES) {
    const gap = Math.abs(mean(r.a) - mean(r.b));
    if (gap < 1.5) continue;
    const qs = [...r.a, ...r.b];
    contradictions.push({
      id: r.id, title: r.title, competency: r.competency, severity: gap >= 2.5 ? "alta" : "moderada", questions: qs,
      compared: qs.map((n) => ({ n, answer: QUESTIONS[n - 1].options[answers[n - 1]].text, points: pts(n) })),
      why: `Possível contradição: ${r.why}. Pode refletir situações diferentes ou outra interpretação das perguntas; não indica falta de sinceridade.`,
      interviewQuestion: r.interviewQuestion,
    });
  }

  // 3) Índice de confiança (da análise, não do candidato)
  let conf = 100;
  const reasons: string[] = [];
  const high = contradictions.filter((c) => c.severity === "alta").length;
  const moderate = contradictions.length - high;
  if (contradictions.length) {
    conf -= high * 15 + moderate * 8;
    reasons.push(`${contradictions.length} possível(is) contradição(ões) entre respostas relacionadas (${high} alta, ${moderate} moderada).`);
  }
  const selfQs = QUESTIONS.filter((q) => q.kind === "self");
  const selfMean = selfQs.reduce((s, q) => s + pts(q.n), 0) / selfQs.length;
  const sitMean = QUESTIONS.filter((q) => q.kind === "situational").reduce((s, q) => s + pts(q.n), 0) / (QUESTIONS.length - selfQs.length);
  if (selfMean - sitMean >= 1) {
    conf -= 15;
    reasons.push("A autoavaliação ficou bem acima do comportamento nas situações apresentadas.");
  }
  const counts = [0, 1, 2, 3].map((x) => answers.filter((a) => a === x).length);
  const sameLetter = Math.max(...counts);
  if (sameLetter >= 15) {
    conf -= 20;
    reasons.push(`${sameLetter} das 25 respostas na mesma posição (alternativa ${LETTERS[counts.indexOf(sameLetter)]}), padrão que pode indicar leitura pouco atenta.`);
  }
  const d = opts.durationMs ?? null;
  const fmt = (ms: number) => { const m = Math.floor(ms / 60000), sec = Math.round((ms % 60000) / 1000); return m === 0 ? `${sec} s` : sec ? `${m} min ${sec} s` : `${m} min`; };
  if (d !== null && d < 3 * 60 * 1000) {
    conf -= 25;
    reasons.push(`Teste respondido em ${fmt(d)}, tempo curto para 25 perguntas.`);
  } else if (d !== null && d < 5 * 60 * 1000) {
    conf -= 10;
    reasons.push(`Teste respondido em ${fmt(d)}, tempo abaixo do esperado.`);
  }
  if (d === null) reasons.push("Tempo de resposta não registrado.");
  if (!reasons.length || (reasons.length === 1 && d === null)) reasons.unshift("Respostas completas e coerentes entre perguntas relacionadas.");
  conf = Math.max(0, Math.min(100, conf));
  const confidence: Confidence = { level: conf >= 75 ? "Alta" : conf >= 50 ? "Moderada" : "Baixa", score: conf, reasons };

  // 4) Pontos fortes, atenção, essenciais e compatibilidade
  const ranked = [...competencies].sort((a, b) => b.score - a.score || b.weight - a.weight);
  const strengths = ranked.filter((c) => c.score >= 80).slice(0, 4).map((c) => c.key);
  const attention = ranked.filter((c) => c.score < 70).reverse().map((c) => c.key);
  const essentials = (profile.essentials ?? []).map((e) => {
    const s = competencies.find((c) => c.key === e.key)!.score;
    return { key: e.key, min: e.min, score: s, met: s >= e.min };
  });
  const unmet = essentials.filter((e) => !e.met).length;
  const compatibility =
    overall >= 75 && unmet === 0 ? { level: "alta" as const, label: "Indicadores compatíveis com as competências priorizadas para a vaga" }
      : overall >= 60 && unmet <= 1 ? { level: "parcial" as const, label: "Compatibilidade parcial: há competências priorizadas a aprofundar" }
        : { level: "baixa" as const, label: "Indicadores abaixo do priorizado para a vaga: investigar na entrevista" };

  const trait = (k: CompetencyKey) => COMPETENCIES.find((c) => c.key === k)!.trait;
  const top = ranked.filter((c) => c.score >= 70).slice(0, 3).map((c) => trait(c.key).toLowerCase());
  const profileText = top.length ? `Perfil ${top.length > 1 ? `${top.slice(0, -1).join(", ")} e ${top.at(-1)}` : top[0]}` : "Perfil em desenvolvimento";

  return {
    kind: "m2", questionnaireVersion: opts.questionnaireVersion ?? "v1", matrixVersion: MATRIX_VERSION,
    jobProfile: { ...profile, weights }, competencies, overall, overallEqual, overallBand: bandV2(overall).label,
    perQuestion, contradictions, confidence, strengths, attention, essentials, compatibility, profile: profileText,
  };
}
