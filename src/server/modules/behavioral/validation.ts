import "server-only";
import { db } from "@/server/db/client";
import { audit } from "@/server/audit/log";
import { authorize, type Actor } from "@/server/authz/authorize";
import { AppError } from "@/server/errors";
import { QUESTIONS } from "./questionnaire";
import { JOB_TEMPLATES } from "./matrix";
import { scoreV2 } from "./scoring-v2";
import { AiError, aiConfigured, aiModel, buildAiInput, callGemini, validateAiOutput, type AiOutput } from "./ai";

// Validação do Recrutador de IA com candidatos SIMULADOS (nenhum candidato é criado ou gravado).
// Serve para o RH conferir, com a IA real, se as análises seguem as notas e os limites definidos.

const pts = (q: (typeof QUESTIONS)[number]) => q.options.map((o) => o.points as number);
const best = QUESTIONS.map((q) => pts(q).indexOf(3));
const worst = QUESTIONS.map((q) => pts(q).indexOf(Math.min(...pts(q))));
const middle = QUESTIONS.map((q) => (pts(q).includes(2) ? pts(q).indexOf(2) : pts(q).indexOf(3)));
const contradictory = (() => {
  const a = [...best];
  a[3] = pts(QUESTIONS[3]).indexOf(1); // P4: fica ansioso com urgências
  a[0] = 0; a[1] = 1; // P1/P2: pouco colaborativo, mas P3 diz preferir equipe
  return a;
})();

export const PERSONAS = [
  { key: "alto", name: "Consistente, indicadores altos", answers: best, durationMs: 9 * 60000 },
  { key: "contraditorio", name: "Respostas contraditórias", answers: contradictory, durationMs: 7 * 60000 },
  { key: "medio", name: "Indicadores intermediários", answers: middle, durationMs: 8 * 60000 },
  { key: "baixo", name: "Consistente, indicadores baixos", answers: worst, durationMs: 6 * 60000 },
] as const;

export type ValidationRow = {
  persona: string; overall: number; contradictions: number; confidence: string;
  ok: boolean; error: string | null; ms: number; inputTokens: number | null; outputTokens: number | null; filtered: number;
  output: AiOutput | null;
};

export async function runValidation(actor: Actor, templateKey: string, ip?: string | null) {
  authorize(actor, "behavioral.view");
  if (!aiConfigured()) throw new AppError("VALIDATION", "A IA não está configurada (GEMINI_API_KEY).");
  const recent = await db.rateLimitHit.count({ where: { bucket: "ia-validacao", createdAt: { gte: new Date(Date.now() - 2 * 60000) } } });
  if (recent) throw new AppError("RATE_LIMITED", "Aguarde 2 minutos entre uma validação e outra (limite do plano gratuito do Gemini).");
  await db.rateLimitHit.create({ data: { bucket: "ia-validacao" } });
  const tpl = JOB_TEMPLATES.find((t) => t.key === templateKey) ?? JOB_TEMPLATES[0];
  const profile = { template: tpl.key, name: tpl.name, weights: tpl.weights, essentials: tpl.essentials };
  const jobTitle = tpl.key === "padrao" ? null : tpl.name;
  const model = aiModel();

  const rows: ValidationRow[] = await Promise.all(PERSONAS.map(async (p) => {
    const r = scoreV2([...p.answers], { jobProfile: profile, durationMs: p.durationMs });
    const base = { persona: p.name, overall: r.overall, contradictions: r.contradictions.length, confidence: r.confidence.level };
    const started = Date.now();
    try {
      const res = await callGemini(buildAiInput(r, jobTitle), model);
      const { output, filtered } = validateAiOutput(res.raw, r);
      return { ...base, ok: true, error: null, ms: Date.now() - started, inputTokens: res.inputTokens, outputTokens: res.outputTokens, filtered, output };
    } catch (e) {
      const msg = e instanceof AiError || e instanceof Error ? e.message : "Falha.";
      return { ...base, ok: false, error: msg, ms: Date.now() - started, inputTokens: null, outputTokens: null, filtered: 0, output: null };
    }
  }));

  await audit(db, {
    actorId: actor.id, action: "behavioral.ai_validation", entityType: "BehavioralValidation", ipAddress: ip,
    summary: `Validou o Recrutador de IA com candidatos simulados (${tpl.name}): ${rows.filter((x) => x.ok).length}/${rows.length} análises concluídas`,
    after: {
      model, template: tpl.key,
      rows: rows.map((x) => ({
        persona: x.persona, overall: x.overall, contradictions: x.contradictions, confidence: x.confidence, ok: x.ok, error: x.error, ms: x.ms,
        inputTokens: x.inputTokens, outputTokens: x.outputTokens, filtered: x.filtered,
        perfil: x.output?.perfil.sintese ?? null, consideracoes: x.output?.consideracoesFinais ?? null, compatibilidade: x.output?.compatibilidadeVaga ?? null,
        contradicoes: x.output?.contradicoes ?? null, dificuldades: x.output?.possiveisDificuldades ?? null, perguntas: x.output?.perguntasEntrevista?.length ?? null,
        analisePerguntas: x.output?.analisePerguntas.length ?? null, exemploPergunta: x.output?.analisePerguntas.find((a) => a.n === 4)?.interpretacao ?? null,
      })),
    },
  });
  return { model, template: tpl.name, rows };
}
