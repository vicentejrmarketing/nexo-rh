import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { COMPETENCIES, type CompetencyKey } from "./questionnaire";
import type { ResultV2 } from "./scoring-v2";

// Análise do "Recrutador de IA" com o Google Gemini.
// - A IA recebe dados PSEUDONIMIZADOS: cargo da vaga, pesos, perguntas, alternativas escolhidas,
//   notas já calculadas e contradições. Nunca nome, CPF, contato, raça, idade, gênero ou endereço.
// - A IA interpreta; as notas vêm do motor de pontuação e não são alteradas.
// - Cada análise guarda modelo, versão do prompt, versão da matriz e o hash da entrada.

export const PROMPT_VERSION = "p1";
export const AI_PROVIDER = "gemini";
export const aiModel = () => process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
export const aiConfigured = () => !!process.env.GEMINI_API_KEY?.trim();

const KEYS = COMPETENCIES.map((c) => c.key) as [CompetencyKey, ...CompetencyKey[]];
const nameOf = (k: CompetencyKey) => COMPETENCIES.find((c) => c.key === k)!.name;

// ───────── Entrada ─────────

export function buildAiInput(r: ResultV2, jobTitle: string | null) {
  return {
    vaga: {
      cargo: jobTitle ?? "não informado",
      modeloDePesos: r.jobProfile.name,
      pesos: Object.fromEntries(r.competencies.map((c) => [nameOf(c.key), c.weight])),
      competenciasEssenciais: r.essentials.map((e) => ({ competencia: nameOf(e.key), referenciaMinima: e.min })),
    },
    versoes: { questionario: r.questionnaireVersion, matriz: r.matrixVersion },
    notas: {
      geralPonderadaPelaVaga: r.overall,
      geralPesosIguais: r.overallEqual,
      faixaGeral: r.overallBand,
      competencias: r.competencies.map((c) => ({ chave: c.key, competencia: c.name, nota: c.score, faixa: c.band, peso: c.weight })),
      compatibilidade: r.compatibility.label,
      essenciais: r.essentials.map((e) => ({ competencia: nameOf(e.key), nota: e.score, referencia: e.min, atende: e.met })),
    },
    respostas: r.perQuestion.map((q) => ({
      n: q.n, competencia: nameOf(q.competency), tipo: q.kind === "self" ? "autopercepção" : "situação", pergunta: q.question,
      alternativaEscolhida: `${q.answerLetter}) ${q.answer}`, pontos: q.points,
      secundarias: q.secondary.map((s) => ({ competencia: nameOf(s.competency), pontos: s.points })),
    })),
    contradicoes: r.contradictions.map((c) => ({
      id: c.id, titulo: c.title, competencia: nameOf(c.competency), gravidade: c.severity, perguntas: c.questions,
      respostasComparadas: c.compared.map((x) => `P${x.n}: ${x.answer} (${x.points} pts)`),
    })),
    confiancaDaAnalise: { nivel: r.confidence.level, motivos: r.confidence.reasons },
    pontosFortes: r.strengths.map(nameOf),
    pontosDeAtencao: r.attention.map(nameOf),
  };
}

export type AiInput = ReturnType<typeof buildAiInput>;

export const inputHashOf = (input: AiInput, model: string) =>
  createHash("sha256").update(JSON.stringify({ input, model, PROMPT_VERSION })).digest("hex");

// ───────── Instruções ─────────

export const SYSTEM_PROMPT = `Você é um recrutador sênior de Recursos Humanos, especialista em seleção por competências comportamentais, escrevendo em português do Brasil para a equipe de RH.

Você recebe, em JSON, as 25 respostas de um candidato a um questionário fixo de múltipla escolha, as notas JÁ CALCULADAS por uma matriz fixa e as possíveis contradições JÁ IDENTIFICADAS por regras fixas.

Regras obrigatórias:
1. NÃO calcule, altere nem invente notas, pontos ou percentuais. Se citar números, use exatamente os fornecidos.
2. Cruze as 25 respostas para descrever o padrão geral de comportamento; não trate cada pergunta isoladamente.
3. Toda conclusão precisa citar as perguntas que a sustentam (números de 1 a 25). Não invente características sem apoio nas respostas.
4. Diferencie fatos das respostas de hipóteses. Toda dificuldade possível é uma HIPÓTESE a confirmar na entrevista.
5. Contradições são diferenças entre respostas, que podem vir de situações diferentes ou de outra interpretação. Nunca diga que o candidato mentiu, foi desonesto ou tentou enganar.
6. Não infira condições psicológicas, médicas ou de personalidade clínica. Não faça diagnóstico. Não preveja com certeza o comportamento futuro.
7. Não use nem suponha idade, gênero, raça, religião, origem, deficiência ou outras características pessoais. Você não recebe esses dados.
8. Não recomende aprovar ou reprovar. O relatório é apoio à decisão humana.
9. Considere o cargo e os pesos da vaga ao comentar a compatibilidade, sem comparar com candidatos de outras vagas.
10. Escreva de forma objetiva e profissional, frases curtas, sem jargão. Use "o candidato".

Preencha todos os campos do formato pedido. Em "analisePerguntas", traga exatamente uma interpretação para cada uma das 25 perguntas, relacionada à alternativa escolhida e ao conjunto das respostas.`;

// ───────── Formato da resposta ─────────

const evid = { type: "array", items: { type: "integer", minimum: 1, maximum: 25 } };
const compEnum = { type: "string", enum: KEYS };

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    perfil: {
      type: "object",
      properties: {
        sintese: { type: "string" },
        dimensoes: {
          type: "array",
          items: { type: "object", properties: { nome: { type: "string" }, descricao: { type: "string" }, evidencias: evid }, required: ["nome", "descricao", "evidencias"] },
        },
      },
      required: ["sintese", "dimensoes"],
    },
    analisePerguntas: {
      type: "array",
      items: { type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 25 }, interpretacao: { type: "string" } }, required: ["n", "interpretacao"] },
    },
    contradicoes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, comentario: { type: "string" } }, required: ["id", "comentario"] } },
    observacoesAdicionais: { type: "array", items: { type: "object", properties: { perguntas: evid, observacao: { type: "string" } }, required: ["perguntas", "observacao"] } },
    pontosFortes: { type: "array", items: { type: "object", properties: { competencia: compEnum, comentario: { type: "string" }, evidencias: evid }, required: ["competencia", "comentario", "evidencias"] } },
    pontosAtencao: { type: "array", items: { type: "object", properties: { competencia: compEnum, comentario: { type: "string" }, evidencias: evid }, required: ["competencia", "comentario", "evidencias"] } },
    possiveisDificuldades: { type: "array", items: { type: "object", properties: { situacao: { type: "string" }, hipotese: { type: "string" }, evidencias: evid }, required: ["situacao", "hipotese", "evidencias"] } },
    compatibilidadeVaga: { type: "string" },
    perguntasEntrevista: { type: "array", items: { type: "object", properties: { competencia: compEnum, pergunta: { type: "string" }, objetivo: { type: "string" } }, required: ["competencia", "pergunta", "objetivo"] } },
    consideracoesFinais: { type: "string" },
  },
  required: ["perfil", "analisePerguntas", "contradicoes", "observacoesAdicionais", "pontosFortes", "pontosAtencao", "possiveisDificuldades", "compatibilidadeVaga", "perguntasEntrevista", "consideracoesFinais"],
} as const;

const ev = z.array(z.number().int()).default([]);
const outputSchema = z.object({
  perfil: z.object({ sintese: z.string(), dimensoes: z.array(z.object({ nome: z.string(), descricao: z.string(), evidencias: ev })).default([]) }),
  analisePerguntas: z.array(z.object({ n: z.number().int(), interpretacao: z.string() })).default([]),
  contradicoes: z.array(z.object({ id: z.string(), comentario: z.string() })).default([]),
  observacoesAdicionais: z.array(z.object({ perguntas: ev, observacao: z.string() })).default([]),
  pontosFortes: z.array(z.object({ competencia: z.string(), comentario: z.string(), evidencias: ev })).default([]),
  pontosAtencao: z.array(z.object({ competencia: z.string(), comentario: z.string(), evidencias: ev })).default([]),
  possiveisDificuldades: z.array(z.object({ situacao: z.string(), hipotese: z.string(), evidencias: ev })).default([]),
  compatibilidadeVaga: z.string().default(""),
  perguntasEntrevista: z.array(z.object({ competencia: z.string(), pergunta: z.string(), objetivo: z.string() })).default([]),
  consideracoesFinais: z.string(),
});

export type AiOutput = {
  perfil: { sintese: string; dimensoes: { nome: string; descricao: string; evidencias: number[] }[] };
  analisePerguntas: { n: number; interpretacao: string }[];
  contradicoes: { id: string; comentario: string }[];
  observacoesAdicionais: { perguntas: number[]; observacao: string }[];
  pontosFortes: { competencia: CompetencyKey; comentario: string; evidencias: number[] }[];
  pontosAtencao: { competencia: CompetencyKey; comentario: string; evidencias: number[] }[];
  possiveisDificuldades: { situacao: string; hipotese: string; evidencias: number[] }[];
  compatibilidadeVaga: string;
  perguntasEntrevista: { competencia: CompetencyKey; pergunta: string; objetivo: string }[];
  consideracoesFinais: string;
};

// ───────── Validação: a IA não muda notas nem passa dos limites éticos ─────────

const FORBIDDEN = /\b(ment(ir|iu|ira|iroso|irosa|indo)|mentira[s]?|desonest|engan(ar|ou|ando)|transtorno|diagn[oó]stic|patol[oó]gic|psicopat|tdah|depress|bipolar|autis|religi|orienta[cç][aã]o sexual|gravidez|gr[aá]vida)/i;
const NUMBER_CLAIM = /(\d{1,3})(?:[.,]\d+)?\s*(?:pontos|pts|ponto|%|\/\s*100)|\bnota\s+(?:de\s+|geral\s+(?:de\s+)?)?(\d{1,3})/gi;

/** Remove frases com termos proibidos ou com números que não existem no cálculo. Devolve o texto e quantas frases saíram. */
export function sanitizeText(text: string, allowed: Set<number>): { text: string; removed: number } {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let removed = 0;
  const kept = sentences.filter((s) => {
    if (FORBIDDEN.test(s)) { removed++; return false; }
    for (const m of s.matchAll(NUMBER_CLAIM)) {
      const n = Number(m[1] ?? m[2]);
      if (!allowed.has(n)) { removed++; return false; }
    }
    return true;
  });
  return { text: kept.join(" ").trim(), removed };
}

export function validateAiOutput(raw: unknown, r: ResultV2): { output: AiOutput; filtered: number } {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) throw new Error("A IA devolveu um formato inválido.");
  const o = parsed.data;
  const allowed = new Set<number>([0, 1, 2, 3, 100, r.overall, r.overallEqual, ...r.competencies.map((c) => c.score), ...r.essentials.map((e) => e.min)]);
  let filtered = 0;
  const clean = (t: string) => { const s = sanitizeText(t, allowed); filtered += s.removed; return s.text; };
  const evOk = (e: number[]) => [...new Set(e.filter((n) => n >= 1 && n <= 25))].sort((a, b) => a - b);
  const isKey = (k: string): k is CompetencyKey => (KEYS as readonly string[]).includes(k);
  const contradictionIds = new Set(r.contradictions.map((c) => c.id));

  const byN = new Map<number, string>();
  for (const a of o.analisePerguntas) if (a.n >= 1 && a.n <= 25 && !byN.has(a.n)) byN.set(a.n, clean(a.interpretacao));

  // Pontos fortes/atenção da IA só valem para as competências que o cálculo indicou.
  const keepComp = <T extends { competencia: string }>(list: T[], allowedKeys: CompetencyKey[]) =>
    list.filter((x) => { const ok = isKey(x.competencia) && allowedKeys.includes(x.competencia); if (!ok) filtered++; return ok; });

  const output: AiOutput = {
    perfil: {
      sintese: clean(o.perfil.sintese),
      dimensoes: o.perfil.dimensoes.map((d) => ({ nome: d.nome.slice(0, 80), descricao: clean(d.descricao), evidencias: evOk(d.evidencias) })).filter((d) => d.descricao && d.evidencias.length),
    },
    analisePerguntas: [...byN.entries()].sort((a, b) => a[0] - b[0]).map(([n, interpretacao]) => ({ n, interpretacao })).filter((a) => a.interpretacao),
    contradicoes: o.contradicoes.filter((c) => { const ok = contradictionIds.has(c.id); if (!ok) filtered++; return ok; }).map((c) => ({ id: c.id, comentario: clean(c.comentario) })),
    observacoesAdicionais: o.observacoesAdicionais.map((x) => ({ perguntas: evOk(x.perguntas), observacao: clean(x.observacao) })).filter((x) => x.observacao && x.perguntas.length >= 2),
    pontosFortes: keepComp(o.pontosFortes, r.strengths).map((x) => ({ competencia: x.competencia as CompetencyKey, comentario: clean(x.comentario), evidencias: evOk(x.evidencias) })),
    pontosAtencao: keepComp(o.pontosAtencao, r.attention).map((x) => ({ competencia: x.competencia as CompetencyKey, comentario: clean(x.comentario), evidencias: evOk(x.evidencias) })),
    possiveisDificuldades: o.possiveisDificuldades.map((x) => ({ situacao: clean(x.situacao), hipotese: clean(x.hipotese), evidencias: evOk(x.evidencias) })).filter((x) => x.hipotese && x.evidencias.length),
    compatibilidadeVaga: clean(o.compatibilidadeVaga),
    perguntasEntrevista: o.perguntasEntrevista.filter((x) => isKey(x.competencia)).map((x) => ({ competencia: x.competencia as CompetencyKey, pergunta: clean(x.pergunta), objetivo: clean(x.objetivo) })).filter((x) => x.pergunta).slice(0, 12),
    consideracoesFinais: clean(o.consideracoesFinais),
  };
  return { output, filtered };
}

// ───────── Chamada ao Gemini ─────────

export class AiError extends Error {}

export async function callGemini(input: AiInput, model = aiModel()): Promise<{ raw: unknown; inputTokens: number | null; outputTokens: number | null }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AiError("A IA não está configurada.");
  const generationConfig: Record<string, unknown> = { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, maxOutputTokens: 16384 };
  // Modelos Gemini 3 são recomendados com a temperatura padrão; nos demais, temperatura 0 (mais estável).
  if (!model.startsWith("gemini-3")) generationConfig.temperature = 0;
  let res: Response;
  try {
    res = await fetch(`${process.env.GEMINI_BASE_URL?.replace(/\/$/, "") || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: `Dados do teste (JSON):\n${JSON.stringify(input)}` }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new AiError("Sem resposta do Gemini (rede ou tempo esgotado).");
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  if (!res.ok) {
    const status = json.error?.status ?? String(res.status);
    const msg =
      res.status === 429 ? "Limite de uso do Gemini atingido. Tente de novo em alguns minutos."
        : res.status === 400 && /API key/i.test(json.error?.message ?? "") ? "A chave do Gemini é inválida."
          : res.status === 403 ? "A chave do Gemini não tem permissão para este modelo."
            : res.status === 404 ? `Modelo do Gemini não encontrado (${model}).`
              : `Gemini: ${json.error?.message ?? status}`;
    throw new AiError(msg.slice(0, 300));
  }
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new AiError(`O Gemini não devolveu conteúdo (${json.candidates?.[0]?.finishReason ?? "sem motivo"}).`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiError("O Gemini devolveu um texto fora do formato combinado.");
  }
  return { raw, inputTokens: json.usageMetadata?.promptTokenCount ?? null, outputTokens: json.usageMetadata?.candidatesTokenCount ?? null };
}

// ───────── Execução e versões ─────────

/**
 * Gera (ou reaproveita) a análise da IA. Mesma entrada + mesmo modelo + mesmo prompt = mesma análise
 * guardada (não chama a IA de novo), a menos que o RH peça "Reanalisar".
 */
export async function runAnalysis(testId: string, opts: { force?: boolean; requestedById?: string | null } = {}) {
  if (!aiConfigured()) return null;
  const t = await db.behavioralTest.findUnique({
    where: { id: testId },
    select: { id: true, status: true, result: true, candidateJob: { select: { job: { select: { title: true } } } } },
  });
  const r = t?.result as ResultV2 | null;
  if (!t || t.status !== "COMPLETED" || r?.kind !== "m2") return null;
  const model = aiModel();
  const input = buildAiInput(r, t.candidateJob?.job.title ?? null);
  const inputHash = inputHashOf(input, model);
  const last = await db.behavioralAnalysis.findFirst({ where: { testId }, orderBy: { version: "desc" } });
  if (!opts.force) {
    if (last?.status === "COMPLETED" && last.inputHash === inputHash) return last;
    if (last?.status === "PENDING" && Date.now() - last.createdAt.getTime() < 3 * 60 * 1000) return last;
  }
  let row;
  try {
    row = await db.behavioralAnalysis.create({
      data: { testId, version: (last?.version ?? 0) + 1, provider: AI_PROVIDER, model, promptVersion: PROMPT_VERSION, matrixVersion: r.matrixVersion, inputHash, requestedById: opts.requestedById ?? null },
    });
  } catch {
    return db.behavioralAnalysis.findFirst({ where: { testId }, orderBy: { version: "desc" } }); // outra execução criou ao mesmo tempo
  }
  try {
    const res = await callGemini(input, model);
    const { output, filtered } = validateAiOutput(res.raw, r);
    return await db.behavioralAnalysis.update({
      where: { id: row.id },
      data: { status: "COMPLETED", output: output as unknown as Prisma.InputJsonValue, filtered, inputTokens: res.inputTokens, outputTokens: res.outputTokens, completedAt: new Date() },
    });
  } catch (e) {
    const msg = e instanceof AiError || e instanceof Error ? e.message : "Falha na análise.";
    console.error("[ia-comportamental]", msg);
    return db.behavioralAnalysis.update({ where: { id: row.id }, data: { status: "FAILED", error: msg.slice(0, 300), completedAt: new Date() } });
  }
}
