import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle, LinkBreak } from "@phosphor-icons/react/ssr";
import { TestRunner } from "@/components/behavioral/test-runner";
import { PUBLIC_QUESTIONS, openTest } from "@/server/modules/behavioral/service";

export const metadata: Metadata = { title: "Teste comportamental" };

export default function TestPage({ params }: PageProps<"/teste/[token]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content params={params} />
    </Suspense>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-8">{children}</div>;
}

async function Content({ params }: { params: PageProps<"/teste/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const t = await openTest(token);
  if (t.state === "completed") {
    return (
      <Card>
        <CheckCircle size={44} weight="fill" className="text-success" />
        <h1 className="mt-3 text-[24px] font-extrabold">Teste concluído com sucesso!</h1>
        <p className="mt-2 text-[15.5px]">Agradecemos sua participação no processo seletivo.</p>
      </Card>
    );
  }
  if (t.state !== "ok") {
    return (
      <Card>
        <LinkBreak size={36} className="text-danger" />
        <h1 className="mt-3 text-[22px] font-extrabold">{t.state === "expired" ? "Este link venceu" : "Link inválido"}</h1>
        <p className="mt-2 text-[15px] text-muted">{t.state === "expired" ? "Peça um novo link ao RH para fazer o teste." : "Confira se copiou o link completo ou peça um novo ao RH."}</p>
      </Card>
    );
  }
  return <TestRunner token={token} storageKey={`nexo-teste-${t.id}`} fullName={t.fullName} jobTitle={t.jobTitle} storeName={t.storeName} questions={PUBLIC_QUESTIONS} />;
}
