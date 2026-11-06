import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle, LinkBreak, ShieldCheck } from "@phosphor-icons/react/ssr";
import { IdentityGate, AdmissionForm } from "@/components/admission/public-form";
import { DOC_INFO, DOC_KINDS, checkSession, openAdmission } from "@/server/modules/admission/service";
import { getPublicSite } from "@/server/modules/portal/service";
import { digitsOnly, formatPhoneBR } from "@/lib/phone";

export const metadata: Metadata = { title: "Documentos de admissão" };

export default function AdmissionPage({ params }: PageProps<"/admissao/[token]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content params={params} />
    </Suspense>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-[0_2px_14px_rgba(17,18,22,0.05)] sm:p-7">{children}</div>;
}

async function Contact() {
  const site = await getPublicSite();
  if (!site.contactWhatsapp && !site.contactEmail) return <p className="mt-3 text-[14px] text-muted">Fale com o RH que enviou este link.</p>;
  return (
    <p className="mt-3 text-[14px] text-muted">
      Dúvidas? Fale com o RH
      {site.contactWhatsapp && <> pelo WhatsApp <a className="font-semibold text-ink underline" href={`https://wa.me/${digitsOnly(site.contactWhatsapp)}`}>{formatPhoneBR(site.contactWhatsapp) || site.contactWhatsapp}</a></>}
      {site.contactEmail && <> {site.contactWhatsapp ? "ou" : "pelo"} e-mail <a className="font-semibold text-ink underline" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></>}.
    </p>
  );
}

async function Content({ params }: { params: PageProps<"/admissao/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const o = await openAdmission(token);
  if (o.state !== "ok") {
    return (
      <Card>
        <LinkBreak size={34} className="text-danger" />
        <h1 className="mt-3 text-[22px] font-extrabold">{o.state === "expired" ? "Este link venceu" : "Link inválido ou já utilizado"}</h1>
        <p className="mt-2 text-[15px] text-muted">{o.state === "expired" ? "Peça ao RH um novo link para enviar seus documentos." : "Confira se copiou o link completo. Se a sua admissão já foi concluída, não é preciso enviar nada."}</p>
        <Contact />
      </Card>
    );
  }
  const a = o.admission;
  const cj = a.candidateJob;
  const firstName = cj.candidate.fullName.split(" ")[0];
  const sess = (await cookies()).get("nexo_adm")?.value;

  if (!checkSession(sess, a.id)) {
    return (
      <Card>
        <h1 className="text-[24px] font-extrabold">Olá, {firstName}!</h1>
        <p className="mt-2 text-[15px]">Parabéns pela contratação na vaga de <strong>{cj.job.title}</strong> · {cj.job.store.name}. Agora falta enviar seus documentos.</p>
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-brand-soft p-4 text-[14px]">
          <ShieldCheck size={22} weight="fill" className="shrink-0" />
          <span>Para sua segurança, confirme seu CPF antes de continuar.</span>
        </div>
        <IdentityGate token={token} />
      </Card>
    );
  }

  if (a.status === "SUBMITTED") {
    return (
      <Card>
        <CheckCircle size={40} weight="fill" className="text-success" />
        <h1 className="mt-3 text-[24px] font-extrabold">Documentos recebidos!</h1>
        <p className="mt-2 text-[15px]">Obrigado, {firstName}. O RH vai conferir tudo e, se precisar de algum ajuste, você recebe uma mensagem com este mesmo link.</p>
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line text-[14px]">
          {DOC_KINDS.filter((k) => a.files.some((f) => f.kind === k)).map((k) => (
            <li key={k} className="flex items-center justify-between gap-2 p-3">{DOC_INFO[k].label}<CheckCircle size={18} weight="fill" className="shrink-0 text-success" /></li>
          ))}
        </ul>
        <Contact />
      </Card>
    );
  }

  const children = (Array.isArray(a.children) ? a.children : []) as { name: string; cpf: string; birthDate: string }[];
  return (
    <>
      <div className="mb-5">
        <h1 className="text-[26px] leading-tight font-extrabold">Documentos de admissão</h1>
        <p className="mt-1 text-[15px] text-muted">{cj.candidate.fullName} · {cj.job.title} · {cj.job.store.name}</p>
      </div>
      <AdmissionForm
        token={token}
        status={a.status}
        reviewNote={a.reviewNote}
        expiresAt={a.tokenExpiresAt!.toISOString()}
        docs={DOC_KINDS.map((k) => ({ kind: k, ...DOC_INFO[k] }))}
        files={a.files.map((f) => ({ id: f.id, kind: f.kind, fileName: f.fileName, status: f.status, rejectionReason: f.rejectionReason, sizeBytes: f.sizeBytes }))}
        saved={{
          email: a.email ?? cj.candidate.email ?? "", race: a.race ?? "", uniformSize: a.uniformSize ?? "", education: a.education ?? "",
          pisNis: a.pisNis ?? "", maritalStatus: a.maritalStatus ?? "", spouseName: a.spouseName ?? "", spouseCpf: a.spouseCpf ?? "",
          spouseBirthDate: a.spouseBirthDate ?? "", needsTransport: a.needsTransport === null ? "" : a.needsTransport ? "sim" : "nao",
          busesPerDay: a.busesPerDay?.toString() ?? "", transportDailyCost: a.transportDailyCost ? Number(a.transportDailyCost).toFixed(2).replace(".", ",") : "",
          bankAccount: a.bankAccount ?? "", bankBranch: a.bankBranch ?? "", pixKey: a.pixKey ?? "",
        }}
        savedChildren={children}
      />
    </>
  );
}
