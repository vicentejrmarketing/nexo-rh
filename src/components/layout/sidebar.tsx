"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Archive, BarChart3, Briefcase, CalendarDays, KanbanSquare, LayoutDashboard, LogOut, Menu,
  MessageSquare, Settings, Store, Users, X, type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Briefcase, Users, KanbanSquare, Archive, CalendarDays, MessageSquare, Store, BarChart3, Settings,
};

type Item = { href: string; label: string; icon: string };
type UserInfo = { name: string; roleName: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

function NavLinks({ items, onNavigate }: { items: Item[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-0.5 px-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors",
              active ? "bg-white/[0.07] font-medium text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white",
            )}
          >
            {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-brand" aria-hidden="true" />}
            <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-brand" : "text-white/50 group-hover:text-white/80"} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ user }: { user: UserInfo }) {
  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-ink" aria-hidden="true">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-white">{user.name}</p>
          <p className="truncate text-[12px] text-white/50">{user.roleName}</p>
        </div>
        <form
          action={async () => {
            await logoutAction();
            // Carga completa de propósito: nada da sessão encerrada fica no cache do navegador.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/login");
          }}
        >
          <button
            type="submit"
            title="Sair"
            aria-label="Sair do sistema"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({ items, user }: { items: Item[]; user: UserInfo }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barra superior no celular */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Menu fixo no computador */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-ink lg:flex">
        <div className="flex h-16 items-center px-6">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <NavLinks items={items} />
        </div>
        <UserBlock user={user} />
      </aside>

      {/* Gaveta no celular */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[272px] flex-col bg-ink">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </div>
            <UserBlock user={user} />
          </aside>
        </div>
      )}
    </>
  );
}

export function SidebarSkeleton() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-ink lg:flex" aria-hidden="true">
      <div className="flex h-16 items-center px-6">
        <Logo />
      </div>
      <div className="flex flex-col gap-2 px-6 py-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-white/[0.06]" />
        ))}
      </div>
    </aside>
  );
}
