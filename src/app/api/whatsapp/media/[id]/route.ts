import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { visibleConversationsWhere } from "@/server/modules/messages/service";
import { downloadMedia, loadConfig, MetaError } from "@/server/whatsapp/client";

// Mídia recebida no WhatsApp: baixada da Meta na hora, só para quem pode ver a conversa. Nada fica público.
export async function GET(_req: Request, ctx: RouteContext<"/api/whatsapp/media/[id]">) {
  const actor = await getActor();
  if (!actor || !actor.permissions.has("messages.view")) return NextResponse.json({ error: "Sem acesso." }, { status: 401 });
  const { id } = await ctx.params;
  const m = await db.message.findFirst({ where: { id, mediaId: { not: null }, conversation: visibleConversationsWhere(actor) }, select: { mediaId: true, mediaMime: true } });
  if (!m?.mediaId) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const cfg = await loadConfig();
  if (!cfg) return NextResponse.json({ error: "WhatsApp não conectado." }, { status: 503 });
  try {
    const f = await downloadMedia(cfg, m.mediaId);
    const mime = f.mime || m.mediaMime || "application/octet-stream";
    return new NextResponse(new Uint8Array(f.data), {
      headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Content-Disposition": "inline" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof MetaError ? e.message : "Não foi possível abrir a mídia." }, { status: 502 });
  }
}
