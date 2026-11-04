import type { PermissionKey } from "@/server/authz/catalog";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // nome do ícone lucide (resolvido no componente cliente)
  /** Basta uma das permissões para o item aparecer. */
  anyOf: PermissionKey[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/visao-geral", label: "Visão Geral", icon: "LayoutDashboard", anyOf: ["dashboard.view"] },
  { href: "/vagas", label: "Vagas", icon: "Briefcase", anyOf: ["jobs.view"] },
  { href: "/candidatos", label: "Candidatos", icon: "Users", anyOf: ["candidates.view"] },
  { href: "/funil", label: "Funil de Recrutamento", icon: "KanbanSquare", anyOf: ["pipeline.view"] },
  { href: "/banco-de-talentos", label: "Banco de Talentos", icon: "Archive", anyOf: ["talentpool.view"] },
  { href: "/entrevistas", label: "Entrevistas", icon: "CalendarDays", anyOf: ["interviews.view"] },
  { href: "/mensagens", label: "Mensagens", icon: "MessageSquare", anyOf: ["messages.view"] },
  { href: "/lojas", label: "Lojas", icon: "Store", anyOf: ["stores.view"] },
  { href: "/relatorios", label: "Relatórios", icon: "BarChart3", anyOf: ["reports.view"] },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: "Settings",
    anyOf: ["users.view", "users.manage", "permissions.manage", "settings.manage", "integrations.manage", "audit.view", "templates.manage"],
  },
];
