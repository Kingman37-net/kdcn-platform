// KDCN Platform V2 — error types

export class ApiError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorEnvelope(code, message, requestId = null, details = null) {
  return {
    ok: false,
    error: { code, message, details, request_id: requestId },
  };
}

export function successEnvelope(data, meta = null) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return body;
}
