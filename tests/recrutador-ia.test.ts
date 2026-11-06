// Recrutador de IA: dados enviados à IA, validação do que volta, versões e pesos por vaga.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createJob } from "@/server/modules/jobs/service";
import { createCandidate } from "@/server/modules/candidates/service";
import { QUESTIONS } from "@/server/modules/behavioral/questionnaire";
import { scoreV2, type ResultV2 } from "@/server/modules/behavioral/scoring-v2";
import { buildAiInput, runAnalysis, sanitizeText, validateAiOutput } from "@/server/modules/behavioral/ai";
import { compareForJob, createTest, getReport, saveJobProfile, saveReview, submitTest } from "@/server/modules/behavioral/service";
import { JOB_TEMPLATES } from "@/server/modules/behavioral/matrix";
import { adminActor, makeActor, makeStore, resetDatabase } from "./support/db";

const meta = { ip: "10.0.0.5", userAgent: "vitest" };
const best = QUESTIONS.map((q) => q.options.findIndex((o) => o.points === 3));
const worst = QUESTIONS.map((q) => q.options.map((o) => o.points as number).indexOf(Math.min(...q.options.map((o) => o.points))));
const tokenOf = (path: string) => path.split("/").pop()!;
const vendedor = JOB_TEMPLATES.find((t) => t.key === "vendedor")!;

function aiReply(r: ResultV2, extra: Record<string, unknown> = {}) {
  return {
    perfil: { sintese: `O candidato mostra um padrão consistente nas situações de equipe. Nota geral ${r.overall}.`, dimensoes: [{ nome: "Colaborativo", descricao: "Oferece ajuda e busca consenso.", evidencias: [1, 2, 99] }] },
    analisePerguntas: QUESTIONS.map((q) => ({ n: q.n, interpretacao: `Na pergunta ${q.n}, a escolha indica um comportamento coerente com o restante.` })),
    contradicoes: [{ id: "inexistente", comentario: "x" }],
    observacoesAdicionais: [],
    pontosFortes: r.competencies.map((c) => ({ competencia: c.key, comentario: "Bom indicador.", evidencias: [1] })),
    pontosAtencao: [],
    possiveisDificuldades: [{ situacao: "Picos de movimento", hipotese: "Hipótese: pode precisar de apoio para priorizar. Confirmar na entrevista.", evidencias: [4] }],
    compatibilidadeVaga: "Compatível com o que a vaga prioriza. O candidato mentiu em uma resposta. Ele teria nota 97 em metas.",
    perguntasEntrevista: [{ competencia: "goals", pergunta: "Conte uma meta difícil.", objetivo: "Confirmar a reação a metas." }],
    consideracoesFinais: "Indicadores elevados de colaboração e iniciativa.",
    ...extra,
  };
}

function mockGemini(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(status === 200
    ? { candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }], usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 2500 } }
    : { error: { message: "quota", status: "RESOURCE_EXHAUSTED" } }), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function setup() {
  const admin = await adminActor();
  const store = await makeStore("Loja Centro");
  const job = await createJob(admin, { title: "Vendedor", description: "Vendas na loja física.", openings: "1", storeId: store.id, priority: "MEDIUM" });
  const c = await createCandidate(admin, { fullName: "Lucas Pereira", cpf: "529.982.247-25", phone: "(47) 99111-2222", sameWhatsapp: "on", email: "lucas@ex.com", source: "MANUAL", consent: "on" }, { jobId: job.id });
  const p = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c.id } });
  return { admin, store, job, candidate: c, processId: p.id };
}

beforeEach(async () => {
  await resetDatabase();
  process.env.GEMINI_API_KEY = "chave-de-teste";
  delete process.env.GEMINI_MODEL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

describe("o que vai para a IA", () => {
  it("sem nome, CPF, telefone ou e-mail; com cargo, pesos, respostas, notas e contradições", async () => {
    const r = scoreV2(best, { jobProfile: { template: vendedor.key, name: vendedor.name, weights: vendedor.weights, essentials: vendedor.essentials } });
    const s = JSON.stringify(buildAiInput(r, "Vendedor"));
    expect(s).not.toMatch(/Lucas|Pereira|529|99111|lucas@/);
    expect(s).toContain("\"cargo\":\"Vendedor\"");
    expect(s).toContain("geralPonderadaPelaVaga");
    expect(JSON.parse(s).respostas).toHaveLength(25);
  });
});

describe("validação da resposta da IA", () => {
  it("remove frases com acusação de mentira e com notas que não existem; descarta itens fora do cálculo", () => {
    const r = scoreV2(worst.map((w, i) => (i < 12 ? best[i] : w)));
    const { output, filtered } = validateAiOutput(aiReply(r), r);
    expect(output.compatibilidadeVaga).toBe("Compatível com o que a vaga prioriza.");
    expect(output.perfil.sintese).toContain(`Nota geral ${r.overall}.`); // número real é mantido
    expect(output.perfil.dimensoes[0].evidencias).toEqual([1, 2]);
    expect(output.contradicoes).toEqual([]);
    expect(output.pontosFortes.map((p) => p.competencia).sort()).toEqual([...r.strengths].sort());
    expect(output.analisePerguntas).toHaveLength(25);
    expect(filtered).toBeGreaterThan(0);
    expect(sanitizeText("Ele tem TDAH. Ótimo atendimento.", new Set()).text).toBe("Ótimo atendimento.");
  });

  it("formato inválido é recusado", () => {
    const r = scoreV2(best);
    expect(() => validateAiOutput({ qualquer: 1 }, r)).toThrow(/formato/);
  });
});

describe("fluxo completo com a IA", () => {
  it("resposta → notas da matriz m2 com os pesos congelados da vaga → análise guardada com versões; reaproveita e reanalisa", async () => {
    const { admin, job, candidate, processId } = await setup();
    await saveJobProfile(admin, job.id, { template: "vendedor", weights: vendedor.weights, essentials: vendedor.essentials });
    const { id, path } = await createTest(admin, candidate.id, processId);
    // Mudar os pesos depois do envio não altera o critério deste teste
    await saveJobProfile(admin, job.id, { template: "padrao", weights: Object.fromEntries(Object.keys(vendedor.weights).map((k) => [k, 1])), essentials: [] });
    await submitTest(tokenOf(path), best, meta);
    const t = await db.behavioralTest.findUniqueOrThrow({ where: { id } });
    const r = t.result as unknown as ResultV2;
    expect(t.matrixVersion).toBe("m2");
    expect(r.jobProfile.name).toBe("Vendedor");
    expect(t.confidence).toBeTruthy();
    expect(await db.activityLog.count({ where: { action: "behavioral.job_profile" } })).toBe(2);

    const fetchMock = mockGemini(aiReply(r));
    const a1 = await runAnalysis(id);
    expect(a1).toMatchObject({ status: "COMPLETED", provider: "gemini", model: "gemini-3.1-flash-lite", promptVersion: "p1", matrixVersion: "m2", version: 1, inputTokens: 5000 });
    const sentBody = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(JSON.stringify(sentBody)).not.toMatch(/Lucas|529\.982/);
    expect(sentBody.generationConfig.responseMimeType).toBe("application/json");

    const again = await runAnalysis(id); // mesma entrada: não chama a IA de novo
    expect(again!.id).toBe(a1!.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const a2 = await runAnalysis(id, { force: true, requestedById: admin.id });
    expect(a2!.version).toBe(2);
    const rep = await getReport(admin, id);
    expect(rep.test.analyses.map((x) => x.version)).toEqual([2, 1]); // histórico mantido
    expect(rep.resultV2!.overall).toBe(100); // a IA não mexe nas notas
  });

  it("falha do Gemini fica registrada sem quebrar o relatório; sem chave, nada é chamado", async () => {
    const { admin, candidate, processId } = await setup();
    const { id, path } = await createTest(admin, candidate.id, processId);
    await submitTest(tokenOf(path), best, meta);
    mockGemini({}, 429);
    const a = await runAnalysis(id);
    expect(a).toMatchObject({ status: "FAILED" });
    expect(a!.error).toMatch(/Limite de uso/);
    delete process.env.GEMINI_API_KEY;
    const f = mockGemini({});
    expect(await runAnalysis(id, { force: true })).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect((await getReport(admin, id)).ai.configured).toBe(false);
  });
});

describe("pesos, revisão e comparação", () => {
  it("valida pesos; recrutador não configura; revisão humana auditada; comparação só com os mesmos pesos", async () => {
    const { admin, store, job, candidate, processId } = await setup();
    await expect(saveJobProfile(admin, job.id, { template: "x", weights: { team: 9 }, essentials: [] })).rejects.toBeInstanceOf(ValidationError);
    const recruiter = await makeActor("RECRUITER", [store.id]);
    await expect(saveJobProfile(recruiter, job.id, { template: "vendedor", weights: vendedor.weights, essentials: [] })).rejects.toBeInstanceOf(ForbiddenError);

    const t1 = await createTest(admin, candidate.id, processId);
    await submitTest(tokenOf(t1.path), best, meta);
    const c2 = await createCandidate(admin, { fullName: "Ana Lima", phone: "(47) 99333-4444", sameWhatsapp: "on", source: "MANUAL", consent: "on" }, { jobId: job.id });
    const p2 = await db.candidateJob.findFirstOrThrow({ where: { candidateId: c2.id } });
    await saveJobProfile(admin, job.id, { template: "vendedor", weights: vendedor.weights, essentials: vendedor.essentials });
    const t2 = await createTest(admin, c2.id, p2.id);
    await submitTest(tokenOf(t2.path), worst, meta);
    const cmp = await compareForJob(admin, job.id);
    expect(cmp.groups).toHaveLength(2); // pesos diferentes não se misturam
    expect(cmp.groups.map((g) => g.profile.name).sort()).toEqual(["Padrão (pesos iguais)", "Vendedor"]);

    await saveReview(admin, t1.id, { note: "Confirmado na entrevista: boa colaboração.", items: { "forte:team": "confirmado", "x y": "confirmado" } });
    const rev = await db.behavioralTest.findUniqueOrThrow({ where: { id: t1.id } });
    expect(rev.review).toEqual({ note: "Confirmado na entrevista: boa colaboração.", items: { "forte:team": "confirmado" } });
    expect(await db.activityLog.count({ where: { action: "behavioral.review" } })).toBe(1);
  });
});
