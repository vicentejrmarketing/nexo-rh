import { Suspense } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/layout/sidebar";
import { TopbarActions } from "@/components/layout/topbar";
import { NAV_ITEMS } from "@/lib/navigation";
import { getActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";
import { getShellCounters } from "@/server/modules/dashboard/service";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen lg:flex">
      <Suspense fallback={<SidebarSkeleton />}>
        <AppSidebar />
      </Suspense>
      <main className="relative min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        <div className="absolute top-6 right-4 z-20 sm:right-6 lg:top-7 lg:right-8">
          <Suspense fallback={null}>
            <AppTopbar />
          </Suspense>
        </div>
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}

// Os layouts não redirecionam (ficam guardados no navegador entre navegações);
// quem redireciona para o login ou para a troca de senha é cada página.

async function AppSidebar() {
  const actor = await getActor();
  if (!actor || actor.mustChangePassword) return <SidebarSkeleton />;
  const counters = await getShellCounters(actor);
  // O menu mostra só o que o perfil pode abrir; as páginas e o servidor checam de novo.
  const items = NAV_ITEMS.filter((item) => item.anyOf.some((p) => can(actor, p))).map(({ href, label, icon, badge }) => ({
    href, label, icon, badge: badge === "messages" ? counters.unreadMessages : undefined,
  }));
  return <Sidebar items={items} user={{ name: actor.name, roleName: actor.roleName }} />;
}

async function AppTopbar() {
  const actor = await getActor();
  if (!actor || actor.mustChangePassword) return null;
  const counters = await getShellCounters(actor);
  const canSettings = NAV_ITEMS.at(-1)!.anyOf.some((p) => can(actor, p));
  return (
    <TopbarActions
      name={actor.name}
      canSettings={canSettings}
      unread={counters.unreadNotifications}
      notifications={counters.notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null }))}
    />
  );
}
