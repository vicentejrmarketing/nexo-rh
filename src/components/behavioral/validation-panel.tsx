"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Button, Select } from "@/components/ui";
import { runValidationAction } from "@/app/(app)/teste-comportamental/actions";

type Data = NonNullable<Extract<Awaited<ReturnType<typeof runValidationAction>>, { ok: true }>["data"]>;

/** Roda candidatos simulados pelo Gemini real e mostra o que a IA devolveu (nada é gravado como candidato). */
export function ValidationPanel({ templates }: { templates: { key: string; name: string }[] }) {
  const [tpl, setTpl] = useState("vendedor");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={tpl} onChange={(e) => setTpl(e.target.value)} className="w-auto" aria-label="Vaga simulada">
          {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </Select>
        <Button type="button" disabled={pending} onClick={() => start(async () => {
          setError(null);
          const r = await runValidationAction(tpl);
          if (!r.ok) setError(r.message);
          else if (r.data) setData(r.data);
        })}>{pending ? "Rodando 4 candidatos simulados… (até 1 min)" : "Validar com candidatos simulados"}</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {data && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">Modelo {data.model} · pesos {data.template}</p>
          {data.rows.map((r) => (
            <details key={r.persona} className="rounded-lg border border-line p-3" open={!r.ok}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[14px] font-medium">
                {r.persona}
                <Badge tone={r.ok ? "success" : "danger"}>{r.ok ? "IA respondeu" : "Falhou"}</Badge>
                <span className="text-[12.5px] font-normal text-muted">nota {r.overall} · {r.contradictions} contradição(ões) · confiança {r.confidence} · {(r.ms / 1000).toFixed(1)} s{r.filtered ? ` · ${r.filtered} trecho(s) descartado(s)` : ""}</span>
              </summary>
              {r.error && <p className="mt-2 text-[13px] text-danger">{r.error}</p>}
              {r.output && (
                <div className="mt-3 flex flex-col gap-2 text-[13.5px]">
                  <p><strong>Perfil:</strong> {r.output.perfil.sintese}</p>
                  {r.output.contradicoes.map((c) => <p key={c.id}><strong>Contradição ({c.id}):</strong> {c.comentario}</p>)}
                  {r.output.possiveisDificuldades.map((d, i) => <p key={i}><strong>Hipótese:</strong> {d.situacao}: {d.hipotese}</p>)}
                  <p><strong>Compatibilidade:</strong> {r.output.compatibilidadeVaga}</p>
                  <p><strong>Considerações finais:</strong> {r.output.consideracoesFinais}</p>
                  <p className="text-[12.5px] text-muted">{r.output.analisePerguntas.length}/25 perguntas interpretadas · {r.output.perguntasEntrevista.length} pergunta(s) de entrevista</p>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
