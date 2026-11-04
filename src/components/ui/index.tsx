import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

/** Junta classes resolvendo conflitos do Tailwind (a última vence: bg-white + bg-ink → bg-ink). */
export function cn(...args: Parameters<typeof clsx>) {
  return twMerge(clsx(...args));
}

// ───────── Botões ─────────
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "dark";
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand text-ink hover:bg-brand-strong font-semibold",
  secondary: "bg-white text-ink border border-line hover:border-ink/30",
  danger: "bg-white text-danger border border-danger/30 hover:bg-danger-soft",
  ghost: "text-ink hover:bg-ink/5",
  dark: "bg-ink text-white hover:bg-ink-3 font-semibold",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    buttonStyles[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

// ───────── Cartões ─────────
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-card)] border border-black/[0.05] bg-white shadow-[0_2px_14px_rgba(17,18,22,0.05)]", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ───────── Cabeçalho de página ─────────
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    // O espaço à direita fica livre para o sino e o avatar do topo.
    <div className="mb-6 flex min-h-12 flex-wrap items-center justify-between gap-4 pr-[128px] lg:pr-[140px]">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-ink lg:text-[30px]">{title}</h1>
        {description && <p className="mt-0.5 text-[15px] font-medium text-ink/70">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ───────── Selos ─────────
type Tone = "neutral" | "brand" | "success" | "danger" | "warning" | "dark";
const toneStyles: Record<Tone, string> = {
  neutral: "bg-surface text-muted border-line",
  brand: "bg-brand-soft text-ink border-brand/40",
  success: "bg-success-soft text-success border-success/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  dark: "bg-ink text-white border-ink",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

// ───────── Formulários ─────────
export function Field({
  label,
  htmlFor,
  hint,
  errors,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  errors?: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {errors?.length ? (
        <ul id={`${htmlFor}-error`} className="text-[12.5px] text-danger" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : hint ? (
        <p className="text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none aria-[invalid=true]:border-danger";

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, invalid, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return <select aria-invalid={invalid || undefined} className={cn(inputClass, "pr-8", className)} {...props} />;
}

// ───────── Avisos ─────────
export function Alert({ tone = "danger", title, children }: { tone?: "danger" | "success" | "warning" | "brand"; title?: string; children: ReactNode }) {
  const styles = {
    danger: "border-danger/25 bg-danger-soft text-danger",
    success: "border-success/25 bg-success-soft text-success",
    warning: "border-warning/25 bg-warning-soft text-warning",
    brand: "border-brand/50 bg-brand-soft text-ink",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", styles)} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}

// ───────── Estado vazio ─────────
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-ink">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink/[0.06]", className)} />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-6 h-4 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72" />
    </div>
  );
}
