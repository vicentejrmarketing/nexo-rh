import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui";
import { requirePageActor } from "@/server/auth/current-user";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Trocar senha" };

export default function ChangePasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="mb-8 rounded-xl bg-ink px-5 py-3">
        <Logo />
      </div>
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-white p-8">
        <Suspense fallback={<Skeleton className="h-80" />}>
          <Content />
        </Suspense>
      </div>
    </div>
  );
}

async function Content() {
  const actor = await requirePageActor({ allowPasswordChange: true });
  return (
    <>
      <h1 className="text-xl font-semibold text-ink">{actor.mustChangePassword ? "Crie a sua senha" : "Trocar senha"}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {actor.mustChangePassword
          ? `Olá, ${actor.name.split(" ")[0]}. Antes de continuar, troque a senha temporária por uma senha só sua.`
          : "Ao trocar a senha, as suas outras sessões abertas serão encerradas."}
      </p>
      <ChangePasswordForm />
    </>
  );
}
