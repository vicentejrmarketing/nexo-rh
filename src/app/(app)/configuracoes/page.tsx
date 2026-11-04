import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  Building2, ChevronRight, History, KeyRound, ListOrdered, MessageSquareText, Bell, BriefcaseBusiness, ShieldCheck, Store, Users, Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Badge, Card, PageHeader, PageSkeleton } from "@/components/ui";
import { NoPermission } from "@/components/layout/states";
import { requirePageActor } from "@/server/auth/current-user";
import { can, type Actor } from "@/server/authz/authorize";
import type { PermissionKey } from "@/server/authz/catalog";

export const metadata: Metadata = { title: "Configurações" };

type Section = { title: string; description: string; icon: LucideIcon; href?: string; stage?: string; anyOf: PermissionKey[] | "all" };

const SECTIONS: Section[] = [
  { title: "Usuários", description: "Equipe, perfis, lojas atribuídas e senhas temporárias.", icon: Users, href: "/configuracoes/usuarios", anyOf: ["users.view"] },
  { title: "Permissões", description: "O que cada perfil pode ver e fazer.", icon: ShieldCheck, href: "/configuracoes/permissoes", anyOf: ["users.view", "permissions.manage"] },
  { title: "Histórico de atividades", description: "Quem fez o quê, e quando.", icon: History, href: "/configuracoes/auditoria", anyOf: ["audit.view"] },
  { title: "Minha senha", description: "Trocar a sua senha de acesso.", icon: KeyRound, href: "/trocar-senha", anyOf: "all" },
  { title: "Etapas do funil", description: "As etapas do processo seletivo e a ordem delas.", icon: ListOrdered, href: "/configuracoes/etapas", anyOf: ["settings.manage", "pipeline.view"] },
  { title: "Integração WhatsApp", description: "Conexão com a API oficial da Meta.", icon: Smartphone, href: "/configuracoes/whatsapp", anyOf: ["integrations.manage"] },
  { title: "Lojas", description: "Unidades, responsáveis e status.", icon: Store, href: "/lojas", anyOf: ["stores.manage"] },
  { title: "Cargos", description: "Cargos usados nas vagas e no cadastro de candidatos.", icon: BriefcaseBusiness, href: "/configuracoes/cargos", anyOf: ["settings.manage"] },
  { title: "Dados da empresa e LGPD", description: "Razão social, contato, política de privacidade e retenção.", icon: Building2, href: "/configuracoes/empresa", anyOf: ["settings.manage"] },
  { title: "Modelos de mensagens", description: "Textos de convocação, lembrete, aprovação e reprovação.", icon: MessageSquareText, stage: "Etapa 4", anyOf: ["templates.manage"] },
  { title: "Notificações", description: "Alertas de entrevistas e candidatos parados.", icon: Bell, stage: "Etapa 4", anyOf: ["settings.manage"] },
];

function visible(actor: Actor, s: Section) {
  return s.anyOf === "all" || s.anyOf.some((p) => can(actor, p));
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const actor = await requirePageActor();
  const sections = SECTIONS.filter((s) => visible(actor, s));
  if (sections.length <= 1 && !can(actor, "users.view")) return <NoPermission />;
  return (
    <>
      <PageHeader title="Configurações" description="Equipe, acessos, integrações e parâmetros do sistema." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          const body = (
            <div className="flex h-full items-start gap-4 p-5">
              <span className={s.href ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-ink" : "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"}>
                <Icon size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{s.title}</p>
                  {s.stage && <Badge>{s.stage}</Badge>}
                </div>
                <p className="mt-1 text-[13px] text-muted">{s.description}</p>
              </div>
              {s.href && <ChevronRight size={18} className="mt-2 text-muted" />}
            </div>
          );
          return s.href ? (
            <Link key={s.title} href={s.href} className="block rounded-[var(--radius-card)] border border-line bg-white transition-colors hover:border-ink/40">
              {body}
            </Link>
          ) : (
            <Card key={s.title} className="opacity-80" aria-disabled="true">
              {body}
            </Card>
          );
        })}
      </div>
    </>
  );
}
