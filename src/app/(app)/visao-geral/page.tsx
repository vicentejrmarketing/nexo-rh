import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarCheck, CheckCircle2, MessageCircle, UserCheck, Users } from "lucide-react";
import { Alert, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { getHeadlineKpis } from "@/server/modules/dashboard/service";
import { listActivity } from "@/server/modules/audit/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Visão Geral" };

export default function OverviewPage({ searchParams }: PageProps<"/visao-geral">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/visao-geral">["searchParams"] }) {
  const actor = await requirePageActor();
  if (!can(actor, "dashboard.view")) return <NoPermission />;
  const params = await searchParams;
  const kpis = await getHeadlineKpis(actor);

  const cards = [
    { label: "Candidatos cadastrados", value: kpis.candidates, icon: Users, highlight: true },
    { label: "Conversas iniciadas", value: kpis.conversations, icon: MessageCircle },
    { label: "Entrevistas agendadas", value: kpis.interviews, icon: CalendarCheck },
    { label: "Aprovados", value: kpis.approved, icon: CheckCircle2 },
    { label: "Contratações realizadas", value: kpis.hired, icon: UserCheck },
  ];

  return (
    <>
      <PageHeader
        title={`Olá, ${actor.name.split(" ")[0]}`}
        description={actor.allStores ? "Indicadores de todas as lojas." : `Indicadores das suas ${actor.storeIds.length} loja(s) autorizada(s).`}
      />
      {params.senha === "alterada" && (
        <div className="mb-6">
          <Alert tone="success">Senha alterada. As suas outras sessões foram encerradas.</Alert>
        </div>
      )}

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, highlight }) => (
          <Card key={label} className={highlight ? "border-ink bg-ink text-white" : undefined}>
            <div className="flex items-start justify-between p-5">
              <div>
                <p className={highlight ? "text-[13px] text-white/60" : "text-[13px] text-muted"}>{label}</p>
                <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{value.toLocaleString("pt-BR")}</p>
              </div>
              <span className={highlight ? "flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-ink" : "flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-ink"}>
                <Icon size={18} />
              </span>
            </div>
          </Card>
        ))}
      </section>
      <p className="mt-2 text-[12.5px] text-muted">Contagem total no banco, dentro do seu acesso. Filtros por período, loja e recrutador chegam na Etapa 6.</p>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Gráficos de desempenho" description="Desempenho geral, evolução, funil, lojas e recrutadores." />
          <EmptyState title="Os gráficos aparecem quando houver processos registrados">
            Eles serão calculados a partir das vagas, inscrições e movimentações do funil (Etapa 6). Nenhum número é estimado ou fixo.
          </EmptyState>
        </Card>
        <Suspense fallback={<Card className="h-80" />}>
          <RecentActivity />
        </Suspense>
      </div>

      {can(actor, "users.manage") && (
        <Card className="mt-6">
          <CardHeader title="Primeiros passos" description="O que já pode ser feito nesta etapa." />
          <ol className="grid gap-px overflow-hidden rounded-b-[var(--radius-card)] bg-line sm:grid-cols-3">
            <li className="bg-white p-5">
              <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Agora</p>
              <p className="mt-1 font-medium">Cadastrar a equipe</p>
              <p className="mt-1 text-[13px] text-muted">Crie os usuários com perfil e lojas. Cada um recebe uma senha temporária.</p>
              <Link href="/configuracoes/usuarios" className={`${buttonClass("primary", "sm")} mt-3`}>Abrir usuários</Link>
            </li>
            <li className="bg-white p-5">
              <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Etapa 2</p>
              <p className="mt-1 font-medium">Lojas, vagas e candidatos</p>
              <p className="mt-1 text-[13px] text-muted">Depois das lojas cadastradas, volte aos usuários para vincular cada pessoa às suas unidades.</p>
            </li>
            <li className="bg-white p-5">
              <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Etapa 4</p>
              <p className="mt-1 font-medium">WhatsApp oficial</p>
              <p className="mt-1 text-[13px] text-muted">Conexão com a Meta Cloud API. Até lá, o status aparece como “Não conectado”.</p>
            </li>
          </ol>
        </Card>
      )}
    </>
  );
}

async function RecentActivity() {
  const actor = await requirePageActor();
  if (!can(actor, "audit.view")) {
    return (
      <Card>
        <CardHeader title="Atividades recentes" />
        <EmptyState title="Disponível para gestores">O histórico completo é visível para Gestores de RH e Administradores.</EmptyState>
      </Card>
    );
  }
  const { items } = await listActivity(actor, { page: 1 });
  return (
    <Card>
      <CardHeader
        title="Atividades recentes"
        action={<Link href="/configuracoes/auditoria" className="text-[13px] font-medium text-ink underline decoration-brand decoration-2 underline-offset-4">Ver tudo</Link>}
      />
      <ul className="divide-y divide-line">
        {items.slice(0, 8).map((a) => (
          <li key={a.id} className="px-5 py-3">
            <p className="text-[13.5px] text-ink">{a.summary}</p>
            <p className="mt-0.5 text-[12px] text-muted">
              {a.actor?.name ?? "Sistema"} · {formatDateTime(a.createdAt)}
            </p>
          </li>
        ))}
      </ul>
      {items.length === 0 && <EmptyState title="Nenhuma atividade ainda" />}
    </Card>
  );
}
