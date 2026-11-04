import { connection } from "next/server";
import { db } from "@/server/db/client";

// Verificação de saúde para monitoramento: confirma que a aplicação alcança o banco.
// Não expõe dados nem detalhes internos do erro.
export async function GET() {
  await connection();
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "up", latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[health] falha ao conectar no banco:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
