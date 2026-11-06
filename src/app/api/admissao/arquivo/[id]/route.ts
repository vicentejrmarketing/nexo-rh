import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/current-user";
import { clientInfo } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { admissionFileAccess } from "@/server/modules/admission/service";
import { storage } from "@/server/storage";

// Documento de admissão: só para quem está logado e vê o contratado. Cada abertura fica na auditoria.
export async function GET(_req: Request, ctx: RouteContext<"/api/admissao/arquivo/[id]">) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const driver = storage();
  if (!driver) return NextResponse.json({ error: "Armazenamento não configurado." }, { status: 503 });
  try {
    const { id } = await ctx.params;
    const { ip } = await clientInfo();
    const file = await admissionFileAccess(actor, id, ip);
    const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    const url = await driver.signedUrl(file.storageKey, 60, file.fileName);
    if (url) return NextResponse.redirect(url, { status: 302, headers: noStore });
    const data = await driver.read(file.storageKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        ...noStore, "Content-Type": file.mimeType, "Content-Security-Policy": "sandbox",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    console.error("[admissao-arquivo]", e);
    return NextResponse.json({ error: "Não foi possível abrir o arquivo." }, { status: 500 });
  }
}
