import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/authz/authorize";
import { ROLES } from "@/server/authz/catalog";
import { visibleJobsWhere } from "@/server/authz/scopes";
import { getCompanySettings } from "@/server/modules/settings/service";
import { formatDateTime } from "@/lib/format";
import { dayKey } from "@/lib/period";

// Alertas gerados sob demanda, quando o usuário usa o sistema (sem fila nem agendador):
// - entrevista nas próximas 24 h (para o entrevistador, ou para quem agendou se não houver);
// - candidatos parados além do prazo da etapa (um resumo por dia).
// Cada alerta tem uma chave única (dedupeKey) e nunca é criado duas vezes.

const lastRun = new Map<string, number>();
const EVERY_MS = 5 * 60 * 1000;

export async function ensureAlerts(actor: Actor, now = new Date(), force = false) {
  const prev = lastRun.get(actor.id) ?? 0;
  if (!force && now.getTime() - prev < EVERY_MS) return;
  lastRun.set(actor.id, now.getTime());

  const tasks: Promise<unknown>[] = [];
  if (actor.permissions.has("interviews.view")) tasks.push(interviewAlerts(actor, now));
  if (actor.permissions.has("pipeline.view")) tasks.push(stalledAlert(actor, now));
  await Promise.allSettled(tasks);
}

async function interviewAlerts(actor: Actor, now: Date) {
  const soon = await db.interview.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gte: now, lt: new Date(now.getTime() + 24 * 3600000) },
      OR: [{ interviewerId: actor.id }, { interviewerId: null, createdById: actor.id }],
      candidateJob: { candidate: { anonymizedAt: null } },
    },
    select: { id: true, scheduledAt: true, mode: true, candidateJob: { select: { candidate: { select: { fullName: true } }, job: { select: { title: true } } } } },
    take: 30,
  });
  if (!soon.length) return;
  await db.notification.createMany({
    data: soon.map((i) => ({
      userId: actor.id, type: "INTERVIEW_SOON" as const,
      title: `Entrevista em breve: ${i.candidateJob.candidate.fullName}`,
      body: `${formatDateTime(i.scheduledAt)} · ${i.mode === "ONLINE" ? "Online" : "Presencial"} · ${i.candidateJob.job.title}`,
      link: `/entrevistas/${i.id}`, dedupeKey: `interview:${i.id}:24h`,
    })),
    skipDuplicates: true,
  });
}

async function stalledAlert(actor: Actor, now: Date) {
  const [settings, stages] = await Promise.all([getCompanySettings(), db.recruitmentStage.findMany({ where: { active: true, kind: "OPEN" }, select: { id: true, stalledDays: true } })]);
  const own = ROLES[actor.roleKey].ownRecordsOnly;
  const counts = await Promise.all(
    stages.map((s) =>
      db.candidateJob.count({
        where: {
          AND: [
            { stageId: s.id, status: "ACTIVE", lastMovedAt: { lt: new Date(now.getTime() - (s.stalledDays ?? settings.stalledDays) * 86400000) } },
            { job: visibleJobsWhere(actor) }, { candidate: { anonymizedAt: null } },
            own ? { recruiterId: actor.id } : {},
          ],
        },
      }),
    ),
  );
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return;
  await db.notification.createMany({
    data: [{
      userId: actor.id, type: "STALLED_CANDIDATE",
      title: `${total} candidato(s) parado(s) no funil`,
      body: own ? "Sob sua responsabilidade, sem movimentação além do prazo da etapa." : "Sem movimentação além do prazo da etapa.",
      link: "/funil?parados=1", dedupeKey: `stalled:${dayKey(now)}`,
    }],
    skipDuplicates: true,
  });
}

export async function markAllNotificationsRead(actor: Actor) {
  await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}
