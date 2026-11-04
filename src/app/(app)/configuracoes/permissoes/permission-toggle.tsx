"use client";

import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/components/ui";
import type { PermissionKey, RoleKey } from "@/server/authz/catalog";
import { togglePermissionAction } from "../usuarios/actions";

export function PermissionToggle({
  roleKey, roleName, permissionKey, description, granted,
}: { roleKey: string; roleName: string; permissionKey: string; description: string; granted: boolean }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(granted);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-center">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={`${description} — ${roleName}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            setValue(!value);
            const res = await togglePermissionAction(roleKey as RoleKey, permissionKey as PermissionKey, !value);
            if (!res.ok) setError(res.message);
          })
        }
        className={cn(
          "relative h-6 w-11 rounded-full border transition-colors disabled:opacity-60",
          value ? "border-ink bg-ink" : "border-line bg-surface",
        )}
      >
        <span className={cn("absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all", value ? "left-[22px] bg-brand" : "left-0.5 bg-white shadow-sm")} />
      </button>
      {error && <span className="mt-1 max-w-32 text-[11px] text-danger" role="alert">{error}</span>}
    </span>
  );
}
