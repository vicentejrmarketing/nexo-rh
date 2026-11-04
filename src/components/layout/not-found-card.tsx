import Link from "next/link";
import { Card, EmptyState, buttonClass } from "@/components/ui";

export function notFoundCard(title: string, href: string, label: string) {
  return (
    <Card>
      <EmptyState title={title}>
        Ele pode ter sido removido ou não estar entre os registros que você pode ver.
        <div className="mt-4">
          <Link href={href} className={buttonClass("secondary")}>{label}</Link>
        </div>
      </EmptyState>
    </Card>
  );
}
