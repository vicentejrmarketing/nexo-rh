import { CalendarCheck, ChatCircle, CheckCircle, ClipboardText, Laptop, SignOut, UserPlus, XCircle } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/components/ui";

const STAGE: Record<string, { icon: Icon; cls: string }> = {
  applied: { icon: UserPlus, cls: "bg-surface text-ink" },
  contacted: { icon: ChatCircle, cls: "bg-brand-soft text-ink" },
  online_interview: { icon: Laptop, cls: "bg-[#EEF0F4] text-ink" },
  onsite_interview: { icon: CalendarCheck, cls: "bg-brand-soft text-ink" },
  trial: { icon: ClipboardText, cls: "bg-[#EEF0F4] text-ink" },
  approved: { icon: CheckCircle, cls: "bg-success-soft text-ink" },
  hired: { icon: CheckCircle, cls: "bg-success text-white" },
  rejected: { icon: XCircle, cls: "bg-danger-soft text-danger" },
  withdrawn: { icon: SignOut, cls: "bg-surface text-muted" },
};

export function StagePill({ stageKey, name, className }: { stageKey: string; name: string; className?: string }) {
  const s = STAGE[stageKey] ?? STAGE.applied;
  const Ico = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap", s.cls, className)}>
      <Ico size={14} weight="fill" /> {name}
    </span>
  );
}
