// Catálogo de permissões e perfis — fonte da verdade sincronizada no banco pelo seed.
// O administrador pode ajustar a matriz depois em Configurações → Permissões.

export const PERMISSIONS = {
  "dashboard.view": { module: "Visão Geral", description: "Ver o painel e os indicadores" },
  "users.view": { module: "Usuários", description: "Ver usuários da equipe" },
  "users.manage": { module: "Usuários", description: "Criar, editar, desativar e excluir usuários" },
  "permissions.manage": { module: "Usuários", description: "Alterar permissões dos perfis" },
  "settings.manage": { module: "Configurações", description: "Dados da empresa, cargos, etapas do funil e notificações" },
  "integrations.manage": { module: "Configurações", description: "Configurar a integração com o WhatsApp" },
  "audit.view": { module: "Configurações", description: "Ver o histórico de atividades" },
  "stores.view": { module: "Lojas", description: "Ver lojas autorizadas" },
  "stores.manage": { module: "Lojas", description: "Criar e editar lojas" },
  "jobs.view": { module: "Vagas", description: "Ver vagas" },
  "jobs.create": { module: "Vagas", description: "Criar e duplicar vagas" },
  "jobs.update": { module: "Vagas", description: "Editar, abrir, pausar e encerrar vagas" },
  "jobs.delete": { module: "Vagas", description: "Excluir vagas" },
  "candidates.view": { module: "Candidatos", description: "Ver candidatos" },
  "candidates.create": { module: "Candidatos", description: "Cadastrar candidatos" },
  "candidates.update": { module: "Candidatos", description: "Editar candidatos, etiquetas e observações" },
  "candidates.delete": { module: "Candidatos", description: "Excluir ou anonimizar candidatos" },
  "resumes.view": { module: "Candidatos", description: "Abrir currículos" },
  "pipeline.view": { module: "Funil", description: "Ver o funil de recrutamento" },
  "pipeline.move": { module: "Funil", description: "Movimentar candidatos entre etapas" },
  "interviews.view": { module: "Entrevistas", description: "Ver entrevistas" },
  "interviews.manage": { module: "Entrevistas", description: "Agendar, reagendar e cancelar entrevistas" },
  "interviews.evaluate": { module: "Entrevistas", description: "Registrar avaliações" },
  "messages.view": { module: "Mensagens", description: "Ver conversas" },
  "messages.send": { module: "Mensagens", description: "Enviar mensagens" },
  "templates.manage": { module: "Mensagens", description: "Editar modelos de mensagens" },
  "talentpool.view": { module: "Banco de Talentos", description: "Pesquisar o banco de talentos" },
  "talentpool.manage": { module: "Banco de Talentos", description: "Etiquetar e vincular candidatos a vagas" },
  "reports.view": { module: "Relatórios", description: "Ver relatórios" },
  "reports.export": { module: "Relatórios", description: "Exportar relatórios em PDF e Excel" },
  "privacy.manage": { module: "LGPD", description: "Consentimentos, retenção e anonimização" },
  "admission.view": { module: "Contratados", description: "Ver contratados e documentos de admissão" },
  "admission.manage": { module: "Contratados", description: "Gerar link de documentos e conferir a admissão" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_KEYS = ["ADMIN", "HR_MANAGER", "RECRUITER", "STORE_MANAGER"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

type RoleDef = {
  name: string;
  description: string;
  allStores: boolean;
  /** Recrutador só vê processos sob sua responsabilidade dentro das lojas autorizadas. */
  ownRecordsOnly: boolean;
  permissions: PermissionKey[];
};

export const ROLES: Record<RoleKey, RoleDef> = {
  ADMIN: {
    name: "Administrador",
    description: "Acesso completo, todas as lojas, usuários, permissões e integrações.",
    allStores: true,
    ownRecordsOnly: false,
    permissions: ALL_PERMISSIONS,
  },
  HR_MANAGER: {
    name: "Gestor de RH",
    description: "Todos os processos das lojas autorizadas, vagas, candidatos, recrutadores e relatórios.",
    allStores: false,
    ownRecordsOnly: false,
    permissions: [
      "dashboard.view", "users.view", "audit.view", "stores.view",
      "jobs.view", "jobs.create", "jobs.update", "jobs.delete",
      "candidates.view", "candidates.create", "candidates.update", "candidates.delete", "resumes.view",
      "pipeline.view", "pipeline.move",
      "interviews.view", "interviews.manage", "interviews.evaluate",
      "messages.view", "messages.send", "templates.manage",
      "talentpool.view", "talentpool.manage",
      "reports.view", "reports.export", "privacy.manage", "admission.view", "admission.manage",
    ],
  },
  RECRUITER: {
    name: "Recrutador",
    description: "Seus candidatos e vagas autorizadas, entrevistas, contatos e etapas.",
    allStores: false,
    ownRecordsOnly: true,
    permissions: [
      "dashboard.view", "stores.view", "jobs.view", "jobs.update",
      "candidates.view", "candidates.create", "candidates.update", "resumes.view",
      "pipeline.view", "pipeline.move",
      "interviews.view", "interviews.manage", "interviews.evaluate",
      "messages.view", "messages.send",
      "talentpool.view", "talentpool.manage", "reports.view", "admission.view", "admission.manage",
    ],
  },
  STORE_MANAGER: {
    name: "Gestor de Loja",
    description: "Consulta das lojas autorizadas: vagas, candidatos, entrevistas e contratações.",
    allStores: false,
    ownRecordsOnly: false,
    permissions: [
      "dashboard.view", "stores.view", "jobs.view", "candidates.view", "resumes.view",
      "pipeline.view", "interviews.view", "reports.view", "admission.view",
    ],
  },
};

// Permissões que nunca podem ser retiradas do Administrador (evita trancar o sistema).
export const ADMIN_LOCKED: PermissionKey[] = ["users.manage", "permissions.manage", "users.view"];
