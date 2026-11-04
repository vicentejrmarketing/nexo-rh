"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CaretDown, GearSix, Key, SignOut } from "@phosphor-icons/react";
import { cn } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";
import { initials, useDismiss } from "./sidebar";

type Notification = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

function NotificationsButton({ items, unread }: { items: Notification[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notificações: ${unread} não lida(s)` : "Notificações"}
        aria-expanded={open}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgba(17,18,22,0.06)] hover:bg-surface"
      >
        <Bell size={24} weight="regular" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <p className="border-b border-line px-4 py-3 text-[14px] font-semibold">Notificações</p>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">Nenhuma notificação por enquanto.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const body = (
                  <>
                    <p className={cn("text-[13.5px]", n.readAt ? "text-muted" : "font-medium text-ink")}>{n.title}</p>
                    {n.body && <p className="mt-0.5 text-[12.5px] text-muted">{n.body}</p>}
                    <p className="mt-1 text-[11.5px] text-muted">{timeAgo(n.createdAt)}</p>
                  </>
                );
                return (
                  <li key={n.id} className="px-4 py-3 hover:bg-surface">
                    {n.link ? <Link href={n.link}>{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AvatarMenu({ name, canSettings }: { name: string; canSettings: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" aria-label="Menu da conta" className="flex items-center gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-[15px] font-bold text-ink">{initials(name)}</span>
        <CaretDown size={16} weight="bold" className="text-ink" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-xl">
          <p className="truncate border-b border-line px-4 py-2.5 text-[13px] font-semibold">{name}</p>
          {canSettings && (
            <Link role="menuitem" href="/configuracoes" className="flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-surface">
              <GearSix size={18} weight="fill" /> Configurações
            </Link>
          )}
          <Link role="menuitem" href="/trocar-senha" className="flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-surface">
            <Key size={18} weight="fill" /> Trocar minha senha
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await logoutAction();
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/login");
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] hover:bg-surface"
          >
            <SignOut size={18} weight="fill" /> Sair do sistema
          </button>
        </div>
      )}
    </div>
  );
}

export function TopbarActions({ name, canSettings, notifications, unread }: { name: string; canSettings: boolean; notifications: Notification[]; unread: number }) {
  return (
    <div className="flex items-center gap-4">
      <NotificationsButton items={notifications} unread={unread} />
      <AvatarMenu name={name} canSettings={canSettings} />
    </div>
  );
}
