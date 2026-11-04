import Link from "next/link";
import { Construction, ShieldAlert } from "lucide-react";
import { Card, EmptyState, buttonClass } from "@/components/ui";

export function NoPermission() {
  return (
    <Card>
      <EmptyState icon={<ShieldAlert size={20} />} title="Você não tem acesso a esta página">
        O seu perfil não inclui esta área. Se precisar dela, peça ao administrador.
        <div className="mt-4">
          <Link href="/visao-geral" className={buttonClass("secondary")}>
            Voltar à Visão Geral
          </Link>
        </div>
      </EmptyState>
    </Card>
  );
}

/** Módulo ainda não entregue: deixa claro o que vem e em qual etapa, sem botões sem ação. */
export function ModulePending({ stage, items }: { stage: string; items: string[] }) {
  return (
    <Card>
      <EmptyState icon={<Construction size={20} />} title={`Módulo previsto para a ${stage}`}>
        <p>A estrutura de dados deste módulo já existe. As telas abaixo serão entregues e testadas nessa etapa:</p>
        <ul className="mt-3 inline-flex flex-col gap-1 text-left">
          {items.map((i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              {i}
            </li>
          ))}
        </ul>
      </EmptyState>
    </Card>
  );
}
