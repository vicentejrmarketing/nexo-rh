# NEXO RH

Sistema de recrutamento e seleção para várias lojas: vagas, candidatos, funil, entrevistas,
WhatsApp oficial (Meta Cloud API), portal público de inscrição e relatórios.

## Situação

| Etapa | Conteúdo | Status |
| --- | --- | --- |
| 1 — Fundação | Projeto, banco completo, autenticação, perfis e permissões, lojas por usuário, auditoria, layout preto e amarelo | Entregue |
| 2 — Gestão | Lojas, vagas, candidatos, banco de talentos | Próxima |
| 3 — Recrutamento | Funil Kanban, histórico, entrevistas, avaliações | — |
| 4 — Comunicação | Central de mensagens, WhatsApp oficial, webhooks, templates | — |
| 5 — Portal público | Vagas abertas, inscrição, currículo | — |
| 6 — Inteligência | Dashboard completo, relatórios, exportações | — |
| 7 — Finalização | Revisão de segurança, desempenho, implantação | — |

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · PostgreSQL (Supabase) ·
Prisma 7 · Zod · Argon2id · Vitest. Tarefas em segundo plano: Inngest (Etapa 4).

## Organização

```
prisma/schema.prisma        modelo de dados completo (30 tabelas)
prisma/migrations/          migrações versionadas (+ snapshot do schema)
prisma/seed.ts              perfis, permissões, etapas do funil e 1º administrador
scripts/db/migrate.mjs      migrações com o motor oficial da Prisma em Wasm
src/server/                 regras de negócio — nunca no navegador
  auth/                     login, sessões, senhas
  authz/                    catálogo de permissões, authorize(), scopeFor()
  audit/                    histórico de atividades
  modules/<módulo>/         serviço e validações de cada módulo
src/app/(auth)/             login e troca de senha
src/app/(app)/              área logada (10 abas)
src/components/             componentes visuais
tests/                      testes automatizados
```

## Regras de segurança já implementadas

- Senhas com Argon2id; senha temporária obrigatoriamente trocada no primeiro acesso.
- Sessões no banco (só o hash do token), 12 h deslizantes, máximo de 7 dias, revogáveis.
- Bloqueio de 15 min após 5 erros por e-mail ou 20 por IP; mesma mensagem para e-mail inexistente.
- Toda permissão é checada no servidor (`authorize`), com escopo por loja (`scopeFor`).
  Recrutador só altera registros sob sua responsabilidade.
- Alterações importantes gravam `ActivityLog` na mesma transação.
- Mudança de perfil, lojas ou situação encerra as sessões abertas do usuário.
- RLS habilitado em todas as tabelas: a Data API pública do Supabase não lê nada.
- Cabeçalhos de segurança (X-Frame-Options, nosniff, Referrer-Policy, HSTS em produção).

## Rodando localmente

Requisitos: Node 22+ e PostgreSQL 16+.

```bash
npm install
cp .env.example .env            # preencha DATABASE_URL, TEST_DATABASE_URL e ADMIN_*
npx prisma migrate deploy       # ou: npm run db:migrate
npm run db:seed
npm run dev                     # http://localhost:3000
```

## Testes

```bash
npm run db:migrate:test   # prepara o banco *_test
npm test                  # 89 testes: matriz de permissões, escopo por loja, usuários, login, indicadores
npm run typecheck
npm run lint
```

## Migrações

Alterou `prisma/schema.prisma`? Gere a migração com `npm run db:migrate:create -- nome_curto`
(ou `npx prisma migrate dev --name nome_curto` em máquina com acesso normal à internet) e aplique com
`npm run db:migrate`. Nunca edite uma migração já aplicada.
