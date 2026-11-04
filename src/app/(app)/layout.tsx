import { Suspense } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/layout/sidebar";
import { NAV_ITEMS } from "@/lib/navigation";
import { getActor } from "@/server/auth/current-user";
import { can } from "@/server/authz/authorize";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen lg:flex">
      <Suspense fallback={<SidebarSkeleton />}>
        <AppSidebar />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}

async function AppSidebar() {
  // O layout não redireciona (layouts ficam guardados no navegador entre navegações);
  // quem redireciona para o login ou para a troca de senha é cada página.
  const actor = await getActor();
  if (!actor || actor.mustChangePassword) return <SidebarSkeleton />;
  // O menu mostra só o que o perfil pode abrir; as páginas e o servidor checam de novo.
  const items = NAV_ITEMS.filter((item) => item.anyOf.some((p) => can(actor, p))).map(({ href, label, icon }) => ({ href, label, icon }));
  return <Sidebar items={items} user={{ name: actor.name, roleName: actor.roleName }} />;
}
