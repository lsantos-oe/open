// Erros da API no formato OData v4: {"error":{"code","message","target","details"}}.

export interface ErrorDetail {
  code: string;
  message: string;
  target?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public target?: string,
    public details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, target?: string, details?: ErrorDetail[]) =>
  new ApiError(400, "BadRequest", message, target, details);
export const validation = (message: string, target?: string, details?: ErrorDetail[]) =>
  new ApiError(400, "Validation", message, target, details);
export const unauthorized = (message = "Token ausente, inválido, expirado ou revogado.") =>
  new ApiError(401, "Unauthorized", message);
export const forbidden = (message: string) => new ApiError(403, "Forbidden", message);
export const notFound = (message = "Recurso não encontrado.") => new ApiError(404, "NotFound", message);
export const conflict = (message: string, details?: ErrorDetail[]) =>
  new ApiError(409, "Conflict", message, undefined, details);
export const preconditionFailed = () =>
  new ApiError(412, "PreconditionFailed", "O registro foi alterado por outra pessoa (ETag diferente). Releia e tente de novo.");

/** Converte erros do Postgres/RLS em mensagens úteis, sem vazar detalhes internos. */
export function fromDbError(e: unknown): ApiError {
  // deno-lint-ignore no-explicit-any
  const err = e as any;
  const code: string | undefined = err?.code;
  const msg: string = err?.message ?? String(e);
  if (code === "42501") return forbidden("Sem permissão para esta operação (política de acesso do banco).");
  if (code === "23505") return conflict("Registro duplicado.");
  if (code === "23503") return validation("Referência inválida: um dos Ids informados não existe.");
  if (code === "23514" || code === "22P02" || code === "22007" || code === "22008") {
    return validation(`Valor inválido: ${msg}`);
  }
  if (code === "P0001") return conflict(msg); // raise exception das funções/triggers do app (mensagens em pt-BR)
  return new ApiError(500, "InternalError", "Erro interno. Use o requestId para rastrear.");
}

export function errorBody(e: ApiError, requestId: string) {
  return {
    error: {
      code: e.code,
      message: e.message,
      ...(e.target ? { target: e.target } : {}),
      ...(e.details?.length ? { details: e.details } : {}),
      innererror: { requestId },
    },
  };
}
