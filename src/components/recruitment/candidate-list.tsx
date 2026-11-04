import Link from "next/link";
import { FilePdf, MagnifyingGlass, UsersThree } from "@phosphor-icons/react/ssr";
import { Badge, Card, EmptyState, Input, Select, buttonClass } from "@/components/ui";
import { Pagination } from "@/components/ui/pagination";
import { StagePill } from "@/components/recruitment/stage-pill";
import type { Actor } from "@/server/authz/authorize";
import { candidateFilterOptions, searchCandidates, type CandidateFilters } from "@/server/modules/candidates/service";
import { formatPhoneBR } from "@/lib/phone";
import { formatDate } from "@/lib/format";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function filtersFrom(sp: SP): { filters: CandidateFilters; params: Record<string, string | undefined> } {
  const params = {
    q: one(sp.q), loja: one(sp.loja), cargo: one(sp.cargo), etapa: one(sp.etapa), cidade: one(sp.cidade),
    experiencia: one(sp.experiencia), etiqueta: one(sp.etiqueta), minhas: one(sp.minhas),
  };
  return {
    params,
    filters: {
      q: params.q, storeId: params.loja, positionId: params.cargo, stage: params.etapa, city: params.cidade, experience: params.experiencia,
      tag: params.etiqueta, mine: params.minhas === "1", page: Number(one(sp.pagina)) || 1,
    },
  };
}

/** Busca de candidatos com filtros — usada em Candidatos e no Banco de Talentos. */
export async function CandidateList({ actor, sp, basePath, talentPool = false, emptyAction }: { actor: Actor; sp: SP; basePath: string; talentPool?: boolean; emptyAction?: React.ReactNode }) {
  const { filters, params } = filtersFrom(sp);
  const [res, opts] = await Promise.all([searchCandidates(actor, { ...filters, talentPool }), candidateFilterOptions(actor)]);
  const filtered = Object.values(params).some(Boolean);

  return (
    <Card className="min-w-0">
      <form className="flex flex-wrap gap-3 border-b border-line p-4" role="search" action={basePath}>
        <div className="relative min-w-[220px] flex-[2]">
          <MagnifyingGlass size={17} className="pointer-events-none absolute top-3 left-3 text-muted" />
          <Input name="q" defaultValue={params.q} placeholder="Nome, telefone ou e-mail" aria-label="Buscar candidato" className="pl-9" />
        </div>
        <Input name="cidade" defaultValue={params.cidade} placeholder="Cidade" aria-label="Cidade" className="w-36 flex-1" />
        {talentPool && <Input name="experiencia" defaultValue={params.experiencia} placeholder="Experiência (ex.: caixa)" aria-label="Experiência" className="w-48 flex-1" />}
        <Select name="cargo" defaultValue={params.cargo ?? ""} aria-label="Cargo" className="w-auto">
          <option value="">Todos os cargos</option>
          {opts.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        {opts.stores.length > 1 && (
          <Select name="loja" defaultValue={params.loja ?? ""} aria-label="Loja" className="w-auto">
            <option value="">Todas as lojas</option>
            {opts.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select name="etapa" defaultValue={params.etapa ?? ""} aria-label="Etapa" className="w-auto">
          <option value="">Qualquer etapa</option>
          <option value="sem-processo">Sem processo</option>
          {opts.stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </Select>
        {opts.tags.length > 0 && (
          <Select name="etiqueta" defaultValue={params.etiqueta ?? ""} aria-label="Etiqueta" className="w-auto">
            <option value="">Qualquer etiqueta</option>
            {opts.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" name="minhas" value="1" defaultChecked={params.minhas === "1"} className="h-4 w-4 accent-[#F5B900]" /> Só os meus
        </label>
        <button className={buttonClass("dark")}>Filtrar</button>
        {filtered && <Link href={basePath} className={buttonClass("ghost")}>Limpar</Link>}
      </form>

      {res.items.length === 0 ? (
        <EmptyState icon={<UsersThree size={20} weight="fill" />} title={filtered ? "Nenhum candidato com esses filtros" : talentPool ? "Banco de talentos vazio" : "Nenhum candidato cadastrado"} action={filtered ? undefined : emptyAction}>
          {filtered ? "Ajuste ou limpe os filtros." : talentPool ? "Candidatos cadastrados entram aqui automaticamente e ficam disponíveis para novas vagas." : "Cadastre o primeiro candidato ou vincule a uma vaga aberta."}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Candidato</th>
                  <th className="px-5 py-3 font-medium">Interesse</th>
                  <th className="px-5 py-3 font-medium">Processo atual</th>
                  <th className="px-5 py-3 font-medium">Responsável</th>
                  <th className="px-5 py-3 font-medium">Atualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {res.items.map((c) => {
                  const p = c.processes.find((x) => x.status === "ACTIVE") ?? c.processes[0];
                  return (
                    <tr key={c.id} className="align-top hover:bg-surface/60">
                      <td className="px-5 py-3">
                        <Link href={`/candidatos/${c.id}`} className="font-semibold text-ink hover:underline hover:decoration-brand hover:decoration-2 hover:underline-offset-4">{c.fullName}</Link>
                        {c.attachments.length > 0 && <FilePdf size={15} className="ml-1.5 inline text-muted" aria-label="Tem currículo" />}
                        <p className="text-[12.5px] text-muted">{[formatPhoneBR(c.whatsappE164 ?? c.phoneE164), c.city && `${c.city}${c.state ? `/${c.state}` : ""}`].filter(Boolean).join(" · ") || c.email}</p>
                        {c.tags.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">{c.tags.slice(0, 4).map((t) => <Badge key={t.tag.id} tone="brand">{t.tag.name}</Badge>)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-muted">{[c.desiredPosition?.name, c.desiredStore?.name].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-5 py-3">
                        {p ? (
                          <div className="flex flex-col items-start gap-1">
                            <StagePill stageKey={p.stage.key} name={p.stage.name} />
                            <Link href={`/vagas/${p.job.id}`} className="text-[12px] text-muted hover:underline">{p.job.title} · {p.job.store.name}</Link>
                            {c.processes.length > 1 && <span className="text-[11.5px] text-muted">+{c.processes.length - 1} processo(s)</span>}
                          </div>
                        ) : (
                          <span className="text-[13px] text-muted">Sem processo</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-muted">{c.owner?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-[13px] text-muted">{formatDate(c.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={res.page} pageCount={res.pageCount} total={res.total} params={params} basePath={basePath} noun="candidato(s)" />
        </>
      )}
    </Card>
  );
}
