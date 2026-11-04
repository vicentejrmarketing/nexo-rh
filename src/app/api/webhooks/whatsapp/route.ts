import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { safeEqualHex, sha256Hex } from "@/server/crypto/secrets";
import { loadConfig } from "@/server/whatsapp/client";
import { handleWebhook, validSignature, type WebhookPayload } from "@/server/whatsapp/webhook";

// Endereço que se cadastra na Meta (WhatsApp → Configuração → Webhook).

/** Verificação: a Meta chama com hub.verify_token e espera receber hub.challenge de volta. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = p.get("hub.verify_token") ?? "";
  const integration = await db.whatsAppIntegration.findUnique({ where: { id: "default" }, select: { verifyTokenHash: true } });
  const ok = p.get("hub.mode") === "subscribe" && !!integration?.verifyTokenHash && !!token && safeEqualHex(sha256Hex(token), integration.verifyTokenHash);
  if (!ok) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const cfg = await loadConfig();
  // Sem App Secret não há como provar que o evento veio da Meta: nada é aceito.
  if (!cfg?.appSecret) return new NextResponse("Not configured", { status: 503 });
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) return new NextResponse("Invalid signature", { status: 401 });
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  try {
    await handleWebhook(payload);
  } catch (e) {
    // Erro ao gravar: a Meta reenvia mais tarde (os já gravados não duplicam).
    console.error("[webhook-whatsapp]", e);
    return new NextResponse("Error", { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
