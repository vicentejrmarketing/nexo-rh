import type { PermissionKey } from "@/server/authz/catalog";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Basta uma das permissões para o item aparecer. */
  anyOf: PermissionKey[];
  badge?: "messages";
  /** Abre em nova aba (ex.: o site público de vagas). */
  external?: boolean;
  /** Atalho secundário ao lado do item (ex.: gerenciar publicação). */
  manageHref?: string;
};

export type NavIcon = "home" | "jobs" | "candidates" | "funnel" | "talent" | "interviews" | "messages" | "stores" | "reports" | "settings" | "site" | "hired" | "behavior";

export const NAV_ITEMS: NavItem[] = [
  { href: "/visao-geral", label: "Visão Geral", icon: "home", anyOf: ["dashboard.view"] },
  { href: "/vagas", label: "Vagas", icon: "jobs", anyOf: ["jobs.view"] },
  { href: "/candidatos", label: "Candidatos", icon: "candidates", anyOf: ["candidates.view"] },
  { href: "/funil", label: "Funil de Recrutamento", icon: "funnel", anyOf: ["pipeline.view"] },
  { href: "/banco-de-talentos", label: "Banco de Talentos", icon: "talent", anyOf: ["talentpool.view"] },
  { href: "/entrevistas", label: "Entrevistas", icon: "interviews", anyOf: ["interviews.view"] },
  { href: "/teste-comportamental", label: "Teste Comportamental", icon: "behavior", anyOf: ["behavioral.send", "behavioral.view"] },
  { href: "/contratados", label: "Contratados", icon: "hired", anyOf: ["admission.view"] },
  { href: "/mensagens", label: "Mensagens", icon: "messages", anyOf: ["messages.view"], badge: "messages" },
  { href: "/lojas", label: "Lojas", icon: "stores", anyOf: ["stores.view"] },
  { href: "/relatorios", label: "Relatórios", icon: "reports", anyOf: ["reports.view"] },
  { href: "/trabalhe-conosco", label: "Ver site", icon: "site", anyOf: ["jobs.view"], external: true, manageHref: "/site-de-vagas" },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: "settings",
    anyOf: ["users.view", "users.manage", "permissions.manage", "settings.manage", "integrations.manage", "audit.view", "templates.manage"],
  },
];
