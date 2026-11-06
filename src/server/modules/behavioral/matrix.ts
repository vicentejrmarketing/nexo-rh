// Matriz de avaliação "m2" do questionário v1 (mesmas 25 perguntas e alternativas).
// Cada pergunta avalia uma competência PRINCIPAL e, quando faz sentido, competências SECUNDÁRIAS.
// Pontos de 0 a 3 por alternativa em cada competência avaliada (ordem das alternativas: A, B, C, D).
//
// Pesos dentro da competência:
//   principal situacional = 1 · principal de autopercepção = 0,5 · secundária = 0,5
// Nota da competência (0–100) = Σ(pontos × peso) ÷ Σ(3 × peso) de todas as perguntas que a avaliam.
// Nota geral = média ponderada das 8 notas pelos pesos da vaga (padrão: pesos iguais).
//
// Para mudar pontos ou pesos: criar "m3" e manter "m2" — testes antigos continuam com a matriz deles.
import { COMPETENCIES, QUESTIONS, type CompetencyKey } from "./questionnaire";

export const MATRIX_VERSION = "m2";

type P = [number, number, number, number];
export type MatrixEntry = { n: number; primary: CompetencyKey; secondary: { competency: CompetencyKey; points: P }[] };

// Pontos da competência principal = os mesmos do questionário (QUESTIONS[i].options[x].points).
export const MATRIX: MatrixEntry[] = [
  { n: 1, primary: "team", secondary: [{ competency: "proactivity", points: [0, 2, 3, 1] }, { competency: "responsibility", points: [2, 1, 3, 2] }] },
  { n: 2, primary: "team", secondary: [{ competency: "communication", points: [1, 0, 1, 3] }] },
  { n: 3, primary: "team", secondary: [] },
  { n: 4, primary: "emotional", secondary: [{ competency: "responsibility", points: [1, 3, 1, 2] }, { competency: "problems", points: [1, 3, 0, 2] }] },
  { n: 5, primary: "emotional", secondary: [{ competency: "communication", points: [1, 0, 3, 1] }] },
  { n: 6, primary: "emotional", secondary: [{ competency: "communication", points: [3, 0, 1, 1] }] },
  { n: 7, primary: "goals", secondary: [{ competency: "problems", points: [0, 1, 2, 3] }, { competency: "proactivity", points: [0, 2, 2, 3] }] },
  { n: 8, primary: "goals", secondary: [{ competency: "adaptability", points: [3, 1, 2, 0] }] },
  { n: 9, primary: "goals", secondary: [] },
  { n: 10, primary: "communication", secondary: [{ competency: "responsibility", points: [0, 2, 1, 3] }] },
  { n: 11, primary: "communication", secondary: [{ competency: "team", points: [1, 3, 1, 2] }] },
  { n: 12, primary: "communication", secondary: [] },
  { n: 13, primary: "proactivity", secondary: [{ competency: "team", points: [3, 0, 1, 1] }] },
  { n: 14, primary: "proactivity", secondary: [{ competency: "problems", points: [1, 0, 3, 2] }, { competency: "responsibility", points: [1, 0, 3, 2] }] },
  { n: 15, primary: "proactivity", secondary: [] },
  { n: 16, primary: "responsibility", secondary: [{ competency: "communication", points: [0, 0, 1, 3] }, { competency: "emotional", points: [2, 1, 0, 3] }] },
  { n: 17, primary: "responsibility", secondary: [] },
  { n: 18, primary: "responsibility", secondary: [] },
  { n: 19, primary: "problems", secondary: [{ competency: "emotional", points: [1, 1, 3, 2] }] },
  { n: 20, primary: "problems", secondary: [{ competency: "adaptability", points: [0, 3, 1, 1] }] },
  { n: 21, primary: "problems", secondary: [{ competency: "emotional", points: [1, 1, 0, 3] }] },
  { n: 22, primary: "adaptability", secondary: [] },
  { n: 23, primary: "adaptability", secondary: [{ competency: "proactivity", points: [0, 1, 3, 2] }] },
  { n: 24, primary: "adaptability", secondary: [{ competency: "communication", points: [1, 0, 3, 0] }, { competency: "emotional", points: [2, 1, 3, 0] }] },
  { n: 25, primary: "adaptability", secondary: [{ competency: "emotional", points: [3, 2, 1, 0] }] },
];

export const MATRIX_WEIGHT = { primarySituational: 1, primarySelf: 0.5, secondary: 0.5 } as const;

/** Faixas de interpretação (auxiliares; nunca aprovam nem reprovam). */
export const BANDS_V2 = [
  { min: 90, label: "Muito elevados", tone: "success" },
  { min: 80, label: "Elevados", tone: "success" },
  { min: 70, label: "Satisfatórios", tone: "brand" },
  { min: 60, label: "Merecem atenção", tone: "warning" },
  { min: 0, label: "Precisam ser investigados", tone: "danger" },
] as const;
export const bandV2 = (score: number) => BANDS_V2.find((b) => score >= b.min)!;

// ───────── Contradições (regras fixas) ─────────
// Compara os pontos na competência principal de perguntas relacionadas. Diferença de 2 = moderada, 3 = alta.
// Sempre tratada como "possível contradição": pode refletir situações diferentes ou outra leitura da pergunta.

export type ContradictionRule = {
  id: string;
  title: string;
  competency: CompetencyKey;
  /** Perguntas comparadas: a de referência (geralmente autopercepção) e as de situação. */
  a: number[];
  b: number[];
  why: string;
  interviewQuestion: string;
};

export const CONTRADICTION_RULES: ContradictionRule[] = [
  {
    id: "pressao", title: "Reação a pressão diferente entre situações", competency: "emotional", a: [4], b: [5, 6, 21],
    why: "a forma de lidar com urgências difere da forma de lidar com críticas, grosseria ou decisões difíceis",
    interviewQuestion: "Conte um dia em que você teve várias urgências e ainda recebeu uma cobrança. Como reagiu em cada momento?",
  },
  {
    id: "equipe", title: "Preferência por equipe x atitudes na equipe", competency: "team", a: [3], b: [1, 2],
    why: "o que o candidato diz preferir sobre trabalho em equipe não coincide com o que faz nas situações de equipe",
    interviewQuestion: "Conte uma situação recente em que um colega precisou de você. O que você fez e por quê?",
  },
  {
    id: "comunicacao", title: "Autoavaliação da comunicação x atitudes", competency: "communication", a: [12], b: [10, 11],
    why: "a percepção sobre a própria clareza não coincide com a atitude diante de dúvidas ou opiniões diferentes",
    interviewQuestion: "Explique uma tarefa do seu último trabalho como se eu fosse um colega novo. Como você confere se a pessoa entendeu?",
  },
  {
    id: "autonomia", title: "Preferência por autonomia x iniciativa", competency: "proactivity", a: [15], b: [13, 14],
    why: "a preferência declarada sobre liberdade ou instruções não coincide com a iniciativa mostrada nas situações",
    interviewQuestion: "Conte algo que você resolveu sem que alguém pedisse. Como decidiu agir?",
  },
  {
    id: "comprometimento", title: "Visão de comprometimento x atitudes", competency: "responsibility", a: [18], b: [16, 17],
    why: "a definição de comprometimento não coincide com a forma de lidar com erros ou prazos",
    interviewQuestion: "Conte um erro seu que afetou a equipe. O que você fez nas horas seguintes?",
  },
  {
    id: "motivacao", title: "Motivação declarada x reação a metas", competency: "goals", a: [9], b: [7, 8],
    why: "a motivação declarada não coincide com a reação a metas difíceis ou mais altas",
    interviewQuestion: "Conte uma meta que você achou difícil. O que fez quando percebeu que podia não bater?",
  },
  {
    id: "organizacao", title: "Organização declarada x urgências", competency: "responsibility", a: [17], b: [4],
    why: "a forma de organizar as tarefas no dia a dia não coincide com a reação a várias urgências ao mesmo tempo",
    interviewQuestion: "Como estava organizado o seu dia no último emprego? O que mudava quando chegavam urgências?",
  },
  {
    id: "mudancas", title: "Abertura a mudanças varia conforme a situação", competency: "adaptability", a: [22, 25], b: [23, 24],
    why: "a abertura a mudanças de processo ou de zona de conforto difere da reação a aprender algo novo ou a mudar prioridades",
    interviewQuestion: "Conte uma mudança no trabalho de que você não gostou no começo. Como se adaptou?",
  },
  {
    id: "ajuda", title: "Ajudar colegas x usar o tempo livre", competency: "team", a: [1], b: [13],
    why: "a disposição de ajudar um colega em dificuldade não coincide com o uso do tempo livre depois das próprias tarefas",
    interviewQuestion: "Quando você termina antes, o que costuma fazer? Dê um exemplo da última vez.",
  },
];

// ───────── Modelos de pesos por vaga ─────────
// Peso de 1 (normal) a 3 (prioritária). Competência essencial: referência mínima para compatibilidade.

export type JobWeights = Record<CompetencyKey, number>;
export type Essential = { key: CompetencyKey; min: number };
export type JobTemplate = { key: string; name: string; weights: JobWeights; essentials: Essential[] };

const eq = Object.fromEntries(COMPETENCIES.map((c) => [c.key, 1])) as JobWeights;

export const JOB_TEMPLATES: JobTemplate[] = [
  { key: "padrao", name: "Padrão (pesos iguais)", weights: eq, essentials: [] },
  {
    key: "vendedor", name: "Vendedor", essentials: [{ key: "goals", min: 70 }, { key: "communication", min: 70 }],
    weights: { team: 2, emotional: 2, goals: 3, communication: 3, proactivity: 2, responsibility: 2, problems: 1, adaptability: 1 },
  },
  {
    key: "caixa", name: "Caixa / Atendimento", essentials: [{ key: "responsibility", min: 70 }, { key: "emotional", min: 70 }],
    weights: { team: 2, emotional: 3, goals: 1, communication: 2, proactivity: 1, responsibility: 3, problems: 2, adaptability: 1 },
  },
  {
    key: "administrativo", name: "Administrativo", essentials: [{ key: "responsibility", min: 70 }, { key: "problems", min: 70 }],
    weights: { team: 1, emotional: 1, goals: 1, communication: 2, proactivity: 2, responsibility: 3, problems: 3, adaptability: 1 },
  },
  {
    key: "estoque", name: "Estoque / Logística", essentials: [{ key: "responsibility", min: 70 }],
    weights: { team: 2, emotional: 1, goals: 1, communication: 1, proactivity: 2, responsibility: 3, problems: 2, adaptability: 2 },
  },
  {
    key: "lideranca", name: "Liderança / Gerência", essentials: [{ key: "team", min: 70 }, { key: "communication", min: 70 }, { key: "emotional", min: 70 }],
    weights: { team: 3, emotional: 3, goals: 2, communication: 3, proactivity: 2, responsibility: 2, problems: 3, adaptability: 2 },
  },
];

export const DEFAULT_PROFILE = { template: "padrao", name: "Padrão (pesos iguais)", weights: eq, essentials: [] as Essential[] };

/** Garante a matriz completa (uma entrada por pergunta, na mesma ordem). */
export function assertMatrix() {
  if (MATRIX.length !== QUESTIONS.length || MATRIX.some((m, i) => m.n !== QUESTIONS[i].n || m.primary !== QUESTIONS[i].competency)) {
    throw new Error("Matriz de avaliação incompatível com o questionário.");
  }
}
