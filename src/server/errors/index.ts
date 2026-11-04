// Tratamento centralizado de erros.
// Serviços lançam AppError; ações e rotas convertem em respostas seguras com toActionError().

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para esta ação.") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado.") {
    super("NOT_FOUND", message);
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: Record<string, string[]>, message = "Revise os campos destacados.") {
    super("VALIDATION", message, fieldErrors);
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };

export function toActionError(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof AppError) {
    return { ok: false, code: err.code, message: err.message, fieldErrors: err.fieldErrors };
  }
  // Nunca devolve detalhes internos ao navegador; registra no servidor.
  console.error("[erro-interno]", err);
  return { ok: false, code: "INTERNAL", message: "Ocorreu um erro inesperado. Tente novamente." };
}
