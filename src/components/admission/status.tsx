import { Badge } from "@/components/ui";
import type { AdmissionStatus } from "@/generated/prisma/enums";

const LABEL: Record<AdmissionStatus | "NOT_SENT", string> = {
  NOT_SENT: "Link não enviado", PENDING: "Aguardando contratado", SUBMITTED: "Enviado: conferir", CHANGES_REQUESTED: "Devolvido para correção", COMPLETED: "Completo",
};
const TONE = { NOT_SENT: "neutral", PENDING: "warning", SUBMITTED: "brand", CHANGES_REQUESTED: "danger", COMPLETED: "success" } as const;

export function AdmissionBadge({ status }: { status: AdmissionStatus | null }) {
  const s = status ?? "NOT_SENT";
  return <Badge tone={TONE[s]}>{LABEL[s]}</Badge>;
}
