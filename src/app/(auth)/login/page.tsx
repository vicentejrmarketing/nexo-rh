import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_520px]">
      <section className="relative hidden overflow-hidden bg-ink p-12 lg:flex lg:flex-col lg:justify-between">
        <Logo />
        <div className="max-w-md">
          <p className="text-[13px] font-semibold tracking-[0.18em] text-brand uppercase">Recrutamento e seleção</p>
          <h1 className="mt-4 text-4xl leading-tight font-semibold text-white">
            Vagas, candidatos e lojas no mesmo lugar.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Acompanhe cada processo seletivo da inscrição à contratação, com a equipe toda trabalhando na mesma base.
          </p>
        </div>
        <p className="text-[12px] text-white/40">Acesso restrito à equipe autorizada.</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full border-[48px] border-brand/15" aria-hidden="true" />
      </section>

      <section className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo onDark={false} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Entrar</h2>
          <p className="mt-1 mb-8 text-sm text-muted">Use o e-mail e a senha cadastrados pelo administrador.</p>
          <Suspense fallback={<Skeleton className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
