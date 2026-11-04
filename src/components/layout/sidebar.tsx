"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Briefcase, CalendarDots, CaretDown, ChartBar, ChatCircleText, Funnel, GearSix, House, Key, List, SignOut, Storefront,
  UsersFour, UsersThree, X, type Icon,
} from "@phosphor-icons/react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/components/ui";
import type { NavIcon } from "@/lib/navigation";
import { logoutAction } from "@/app/(auth)/actions";

const ICONS: Record<NavIcon, Icon> = {
  home: House, jobs: Briefcase, candidates: UsersThree, funnel: Funnel, talent: UsersFour,
  interviews: CalendarDots, messages: ChatCircleText, stores: Storefront, reports: ChartBar, settings: GearSix,
};

type Item = { href: string; label: string; icon: NavIcon; badge?: number };
type UserInfo = { name: string; roleName: string };

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

async function logout() {
  await logoutAction();
  // Carga completa de propósito: nada da sessão encerrada fica no cache do navegador.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

/** Fecha um menu suspenso ao clicar fora ou apertar Esc. */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function UserCard({ user }: { user: UserInfo }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative px-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.05]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-[16px] font-bold text-ink" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-white">{user.name}</span>
          <span className="block truncate text-[12.5px] text-white/60">{user.roleName}</span>
        </span>
        <CaretDown size={16} weight="bold" className={cn("text-white/70 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-4 left-4 z-20 mt-1 overflow-hidden rounded-xl border border-white/10 bg-ink-2 py-1 shadow-xl">
          <Link role="menuitem" href="/trocar-senha" className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-white/85 hover:bg-white/[0.06]">
            <Key size={18} weight="fill" className="text-brand" /> Trocar minha senha
          </Link>
          <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-white/85 hover:bg-white/[0.06]">
            <SignOut size={18} weight="fill" className="text-brand" /> Sair do sistema
          </button>
        </div>
      )}
    </div>
  );
}

function NavLinks({ items, onNavigate }: { items: Item[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-1 pr-3">
      {items.map((item) => {
        const Ico = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-[44px] items-center gap-3.5 rounded-r-full pr-4 pl-7 text-[15px] transition-colors",
              active
                ? "bg-gradient-to-r from-brand via-brand to-brand/70 font-semibold text-ink shadow-[0_6px_20px_-8px_rgba(245,185,0,0.6)]"
                : "font-medium text-white/90 hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <Ico size={23} weight="fill" className={active ? "text-ink" : "text-white"} />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className={cn("min-w-6 rounded-full px-1.5 py-0.5 text-center text-[12px] font-bold", active ? "bg-ink text-brand" : "bg-brand text-ink")}>
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomArt() {
  return (
    // Em telas baixas o desenho some para todos os itens do menu caberem sem rolagem.
    <div className="relative mt-4 h-52 shrink-0 overflow-hidden [@media(max-height:860px)]:hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.03] to-white/[0.06]" />
      <div className="relative px-7 pt-4">
        <svg width="82" height="48" viewBox="0 0 82 48" fill="none" stroke="#F5B900" strokeWidth="2.6" strokeLinecap="round">
          <circle cx="41" cy="11" r="8" />
          <path d="M26 46c0-9 6.7-16 15-16s15 7 15 16" />
          <circle cx="15" cy="16" r="6.5" />
          <path d="M3 46c0-7.5 5.4-13 12-13 3 0 5.6 1 7.6 2.8" />
          <circle cx="67" cy="16" r="6.5" />
          <path d="M79 46c0-7.5-5.4-13-12-13-3 0-5.6 1-7.6 2.8" />
        </svg>
        <p className="mt-4 text-[14px] leading-snug font-medium text-white/90">
          Conectando talentos
          <br />a grandes oportunidades
        </p>
      </div>
      <div className="absolute -bottom-16 -left-6 h-16 w-[130%] origin-bottom-left -rotate-[16deg] bg-brand" />
    </div>
  );
}

function SidebarBody({ items, user, onNavigate }: { items: Item[]; user: UserInfo; onNavigate?: () => void }) {
  return (
    <>
      <div className="px-7 pt-7 pb-6">
        <Logo />
      </div>
      <UserCard user={user} />
      <div className="mx-6 my-4 h-px bg-white/10" />
      <div className="flex-1 overflow-y-auto">
        <NavLinks items={items} onNavigate={onNavigate} />
      </div>
      <BottomArt />
    </>
  );
}

export function Sidebar({ items, user }: { items: Item[]; user: UserInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between bg-ink px-4 lg:hidden">
        <Logo compact />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10"
        >
          <List size={24} weight="bold" />
        </button>
      </div>

      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col bg-ink lg:flex">
        <SidebarBody items={items} user={user} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-ink">
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="absolute top-5 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10">
              <X size={20} weight="bold" />
            </button>
            <SidebarBody items={items} user={user} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

export function SidebarSkeleton() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col bg-ink lg:flex" aria-hidden="true">
      <div className="px-7 pt-7 pb-6">
        <Logo />
      </div>
      <div className="flex flex-col gap-3 px-7 py-4">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-white/[0.06]" />
        ))}
      </div>
    </aside>
  );
}
