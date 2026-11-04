import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, CalendarPlus, ChatsCircle, MagnifyingGlass, ShieldWarning, UserCircle, WhatsappLogo } from "@phosphor-icons/react/ssr";
import { Badge, PageHeader, PageSkeleton, buttonClass, cn } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { StagePill } from "@/components/recruitment/stage-pill";
import { InboxLive } from "@/components/messages/live";
import { Composer, Thread, type TemplateOpt } from "@/components/messages/thread";
import { AssignSelect, LinkCandidate, ReactivateButton, StatusSelect } from "@/components/messages/side-controls";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { db } from "@/server/db/client";
import { CONVERSATION_STATUS_LABEL, getConversation, listConversations, templateContext, WINDOW_MS } from "@/server/modules/messages/service";
import { isKnownVar, listTemplates, VARIABLES } from "@/server/modules/messages/templates";
import { integrationStatus } from "@/server/whatsapp/settings";
import { pendingCount } from "@/server/modules/automations/service";
import { MessagesTabs } from "@/components/messages/tabs";
import { formatDateTime } from "@/lib/format";
import { formatPhoneBR } from "@/lib/phone";
import { dayKey, startOfDaySP, timeKey } from "@/lib/period";

export const metadata: Metadata = { title: "Mensagens" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function MessagesPage({ searchParams }: PageProps<"/mensagens">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function when(d: Date | null, today: string) {
  if (!d) return "";
  return dayKey(d) === today ? timeKey(d) : formatDateTime(d).slice(0, 5);
}

async function Content({ searchParams }: { searchParams: PageProps<"/mensagens">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "messages.view")) return <NoPermission />;
  const sp = await searchParams;
  const selected = one(sp.c) ?? null;
  const f = { q: one(sp.q), filter: (one(sp.filtro) ?? "") as "" | "nao-lidas" | "minhas" | "sem-responsavel", assignedToId: one(sp.responsavel), status: one(sp.situacao) };
  const [list, integration, users, pending] = await Promise.all([
    listConversations(actor, f),
    integrationStatus(),
    db.user.findMany({ where: { status: "ACTIVE", role: { permissions: { some: { permission: { key: "messages.send" } } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    pendingCount(actor),
  ]);
  const data = selected ? await getConversation(actor, selected).catch(() => null) : null;
  const connected = integration.status === "CONNECTED";
  const today = dayKey(startOfDaySP(new Date()));
  const qs = (over: Record<string, string | undefined>) =>
    `/mensagens?${new URLSearchParams(Object.entries({ q: f.q, filtro: f.filter || undefined, responsavel: f.assignedToId, situacao: f.status, c: selected ?? undefined, ...over }).filter(([, v]) => v) as [string, string][])}`;

  let composer = null;
  if (data) {
    const c = data.conversation;
    const [templates, ctx] = await Promise.all([listTemplates({ activeOnly: true }), templateContext(actor, c.id, { interviewId: one(sp.entrevista) })]);
    const opts: TemplateOpt[] = templates.map((t) => ({
      id: t.id, name: t.name, purpose: t.purpose, approved: t.approval === "APPROVED" && !!t.metaName, metaBody: t.body,
      vars: t.vars.map((k) => ({ key: k, label: isKnownVar(k) ? VARIABLES[k].label : k })),
    }));
    composer = (
      <Composer
        key={c.id}
        conversationId={c.id}
        windowOpen={data.windowOpen}
        windowEndsAt={c.lastInboundAt ? new Date(c.lastInboundAt.getTime() + WINDOW_MS).toISOString() : null}
        templates={opts}
        context={Object.fromEntries(Object.entries(ctx).filter(([, v]) => v)) as Record<string, string>}
        optedOut={!!c.candidate?.optedOutAt}
        connected={connected}
        canSend={data.canSend}
        initialTemplate={one(sp.modelo)}
      />
    );
  }

  return (
    <>
      <InboxLive conversationId={data?.conversation.id ?? null} />
      <PageHeader title="Mensagens" description="Central de atendimento do WhatsApp oficial." />
      <MessagesTabs active="conversas" pending={pending} />
      {!connected && (
        <p className="mb-3 text-[12.5px] text-muted">Modo 1 clique: as mensagens abrem no WhatsApp da empresa com o texto pronto e ficam registradas aqui. As respostas dos candidatos chegam no seu WhatsApp.</p>
      )}
      <div className="grid h-[calc(100vh-200px)] min-h-[560px] overflow-hidden rounded-[var(--radius-card)] border border-black/[0.06] bg-white shadow-[0_2px_14px_rgba(17,18,22,0.05)] lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]">
        {/* Lista */}
        <aside className={cn("flex min-h-0 flex-col border-r border-line", data && "max-lg:hidden")}>
          <form className="flex flex-col gap-2 border-b border-line p-3" role="search">
            <div className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-3 left-3 text-muted" />
              <input name="q" defaultValue={f.q} placeholder="Nome ou número" aria-label="Buscar conversa" className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[14px] focus:border-ink focus:outline-none" />
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
              <select name="responsavel" defaultValue={f.assignedToId ?? ""} aria-label="Responsável" className="h-9 min-w-0 rounded-lg border border-line bg-white px-2 text-[13px]">
                <option value="">Responsável: todos</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select name="situacao" defaultValue={f.status ?? ""} aria-label="Situação" className="h-9 rounded-lg border border-line bg-white px-2 text-[13px]">
                <option value="">Abertas</option>
                {Object.entries(CONVERSATION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className={buttonClass("dark", "sm")}>Ok</button>
            </div>
          </form>
          <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 text-[12.5px] whitespace-nowrap" aria-label="Filtros rápidos">
            {[["", "Todas"], ["nao-lidas", "Não lidas"], ["minhas", "Minhas"], ["sem-responsavel", "Sem responsável"]].map(([k, l]) => (
              <Link key={k} href={qs({ filtro: k || undefined, c: undefined })} className={cn("rounded-full px-2.5 py-1 font-semibold", f.filter === k ? "bg-ink text-white" : "text-muted hover:bg-surface")}>{l}</Link>
            ))}
          </nav>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 && (
              <li className="px-4 py-10 text-center text-[13px] text-muted">
                <ChatsCircle size={28} className="mx-auto mb-2 text-muted" />
                {f.q || f.filter || f.assignedToId ? "Nenhuma conversa com esses filtros." : "Nenhuma conversa ainda. Elas aparecem quando um candidato escreve ou quando você inicia pelo perfil do candidato."}
              </li>
            )}
            {list.map((c) => (
              <li key={c.id}>
                <Link href={qs({ c: c.id })} className={cn("flex gap-3 border-b border-line px-3 py-3 hover:bg-surface", c.id === selected && "bg-brand-soft hover:bg-brand-soft")}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-brand">
                    {(c.candidate?.fullName ?? c.waContactName ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-[14px]", c.unreadCount ? "font-bold" : "font-medium")}>{c.candidate?.fullName ?? c.waContactName ?? formatPhoneBR(c.waContactE164)}</span>
                      <span className={cn("shrink-0 text-[11.5px]", c.unreadCount ? "font-semibold text-ink" : "text-muted")}>{when(c.lastMessageAt, today)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] text-muted">{c.lastMessageText ?? "Sem mensagens"}</span>
                      {c.unreadCount > 0 && <span className="min-w-5 shrink-0 rounded-full bg-brand px-1.5 text-center text-[11px] font-bold text-ink">{c.unreadCount}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                      {c.candidate ? "" : "Contato não identificado · "}{c.assignedTo?.name ?? "Sem responsável"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        {/* Conversa */}
        <section className={cn("flex min-h-0 flex-col bg-[#f3efe6]", !data && "max-lg:hidden")}>
          {data ? (
            <>
              <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
                <Link href={qs({ c: undefined })} className="rounded-md p-1 text-muted hover:bg-surface lg:hidden" aria-label="Voltar para a lista"><ArrowLeft size={18} /></Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{data.conversation.candidate?.fullName ?? data.conversation.waContactName ?? formatPhoneBR(data.conversation.waContactE164)}</p>
                  <p className="text-[12px] text-muted">{formatPhoneBR(data.conversation.waContactE164)} · {CONVERSATION_STATUS_LABEL[data.conversation.status]}</p>
                </div>
                {data.conversation.candidate && <Link href={`/candidatos/${data.conversation.candidate.id}`} className={cn(buttonClass("secondary", "sm"), "xl:hidden")}>Perfil</Link>}
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Thread
                  messages={data.conversation.messages.map((m) => ({
                    id: m.id, direction: m.direction, body: m.body, status: m.status, mediaType: m.mediaType, hasMedia: !!m.mediaId, errorMessage: m.errorMessage,
                    createdAt: m.createdAt.toISOString(), sender: m.sentBy?.name.split(" ")[0] ?? (m.direction === "OUTBOUND" ? "Sistema" : null),
                    template: m.template?.name ?? null, retrying: m.status === "QUEUED" && m.attempts > 0, manual: m.channel === "MANUAL_LINK",
                  }))}
                />
              </div>
              {composer}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted">
              <WhatsappLogo size={40} weight="fill" className="text-ink/30" />
              <p className="text-[14px]">{selected ? "Conversa não encontrada." : "Escolha uma conversa na lista."}</p>
            </div>
          )}
        </section>

        {/* Candidato */}
        <aside className="min-h-0 overflow-y-auto border-l border-line p-4 max-xl:hidden">
          {data ? <CandidatePanel data={data} actor={{ id: actor.id, selfOnly: ROLES[actor.roleKey].ownRecordsOnly, canSchedule: can(actor, "interviews.manage") }} users={users} /> : <p className="text-[13px] text-muted">Os dados do candidato aparecem aqui.</p>}
        </aside>
      </div>
    </>
  );
}

function CandidatePanel({ data, actor, users }: { data: NonNullable<Awaited<ReturnType<typeof getConversation>>>; actor: { id: string; selfOnly: boolean; canSchedule: boolean }; users: { id: string; name: string }[] }) {
  const c = data.conversation;
  const cand = c.candidate;
  const p = cand?.processes.find((x) => x.status === "ACTIVE") ?? cand?.processes[0];
  return (
    <div className="flex flex-col gap-5 text-[13.5px]">
      {cand ? (
        <div>
          <div className="mb-3 flex items-center gap-2"><UserCircle size={20} weight="fill" /><p className="font-bold">{cand.fullName}</p></div>
          <dl className="flex flex-col gap-2">
            <div><dt className="text-[12px] text-muted">Telefone</dt><dd>{formatPhoneBR(cand.whatsappE164 ?? cand.phoneE164)}</dd></div>
            {cand.email && <div><dt className="text-[12px] text-muted">E-mail</dt><dd className="break-all">{cand.email}</dd></div>}
            {p && (
              <>
                <div><dt className="text-[12px] text-muted">Vaga</dt><dd><Link href={`/vagas/${p.job.id}`} className="hover:underline">{p.job.title}</Link></dd></div>
                <div><dt className="text-[12px] text-muted">Loja</dt><dd>{p.job.store.name}</dd></div>
                <div><dt className="text-[12px] text-muted">Etapa</dt><dd><StagePill stageKey={p.stage.key} name={p.stage.name} /></dd></div>
                <div><dt className="text-[12px] text-muted">Recrutador do processo</dt><dd>{p.recruiter?.name ?? "—"}</dd></div>
                {p.interviews[0] && <div><dt className="text-[12px] text-muted">Próxima entrevista</dt><dd><Link href={`/entrevistas/${p.interviews[0].id}`} className="hover:underline">{formatDateTime(p.interviews[0].scheduledAt)}</Link></dd></div>}
              </>
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/candidatos/${cand.id}`} className={buttonClass("secondary", "sm")}>Abrir perfil</Link>
            {actor.canSchedule && p?.status === "ACTIVE" && <Link href={`/entrevistas/nova?processo=${p.id}`} className={buttonClass("secondary", "sm")}><CalendarPlus size={15} /> Entrevista</Link>}
          </div>
          {cand.optedOutAt && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg bg-warning-soft p-3 text-warning">
              <p className="flex items-center gap-1.5 font-semibold"><ShieldWarning size={16} weight="fill" /> Pediu para não receber mensagens</p>
              <p className="text-[12.5px]">Desde {formatDateTime(cand.optedOutAt)}.</p>
              {data.canSend && <ReactivateButton candidateId={cand.id} />}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-1 font-bold">{c.waContactName ?? "Contato não identificado"}</p>
          <p className="mb-3 text-muted">{formatPhoneBR(c.waContactE164)} não está em nenhum cadastro. Vincule a um candidato:</p>
          {data.canSend ? <LinkCandidate id={c.id} /> : null}
        </div>
      )}
      <div className="border-t border-line pt-4">
        <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Responsável pela conversa</p>
        {data.canSend ? <AssignSelect id={c.id} value={c.assignedTo?.id ?? null} users={users} selfId={actor.id} selfOnly={actor.selfOnly} /> : <p>{c.assignedTo?.name ?? "Sem responsável"}</p>}
      </div>
      {data.canSend && (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Situação</p>
          <StatusSelect id={c.id} value={c.status} labels={CONVERSATION_STATUS_LABEL} />
        </div>
      )}
      <p className="text-[12px] text-muted">
        {data.windowOpen ? <Badge tone="success">Janela de 24 h aberta</Badge> : <Badge>Janela de 24 h fechada</Badge>}
        <span className="mt-1 block">Fora da janela, só modelos aprovados pela Meta podem ser enviados.</span>
      </p>
    </div>
  );
}
