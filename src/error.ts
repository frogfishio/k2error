/**
 * ESM + strict-mode friendly (TS 5+)
 * - Zero runtime dependencies
 * - RFC 7807 compatible Problem Details
 * - OpenAPI / Zod compatible via types (no runtime cost)
 */

export const PROBLEM_JSON = "application/problem+json";

/** Service error identifiers */
export enum ServiceError {
  VALIDATION_ERROR = "validation_error",
  INVALID_REQUEST = "invalid_request",
  ALREADY_EXISTS = "already_exists",
  INVALID_TOKEN = "invalid_token",
  TOKEN_EXPIRED = "token_expired",
  AUTH_ERROR = "auth_error",
  INSUFFICIENT_SCOPE = "insufficient_scope",
  NOT_FOUND = "not_found",
  UNSUPPORTED_METHOD = "unsupported_method",
  SYSTEM_ERROR = "system_error",
  CONFIGURATION_ERROR = "configuration_error",
  SERVICE_ERROR = "service_error",
  BAD_REQUEST = "bad_request",
  PAYMENT_REQUIRED = "payment_required",
  CONFLICT = "conflict",
  UNAUTHORIZED = "unauthorized",
  FORBIDDEN = "forbidden",
  TOO_MANY_REQUESTS = "too_many_requests",
  NOT_IMPLEMENTED = "not_implemented",
  BAD_GATEWAY = "bad_gateway",
  SERVICE_UNAVAILABLE = "service_unavailable",
  GATEWAY_TIMEOUT = "gateway_timeout",
}

/** Canonical HTTP status codes for each service error */
export const errorCodes = {
  [ServiceError.BAD_REQUEST]: 400,
  [ServiceError.VALIDATION_ERROR]: 400,
  [ServiceError.INVALID_REQUEST]: 400,
  [ServiceError.ALREADY_EXISTS]: 409,
  [ServiceError.INVALID_TOKEN]: 401,
  [ServiceError.TOKEN_EXPIRED]: 401,
  [ServiceError.UNAUTHORIZED]: 401,
  [ServiceError.AUTH_ERROR]: 401,
  [ServiceError.PAYMENT_REQUIRED]: 402,
  [ServiceError.FORBIDDEN]: 403,
  [ServiceError.INSUFFICIENT_SCOPE]: 403,
  [ServiceError.NOT_FOUND]: 404,
  [ServiceError.UNSUPPORTED_METHOD]: 405,
  [ServiceError.CONFLICT]: 409,
  [ServiceError.TOO_MANY_REQUESTS]: 429,
  [ServiceError.SYSTEM_ERROR]: 500,
  [ServiceError.CONFIGURATION_ERROR]: 500,
  [ServiceError.SERVICE_ERROR]: 500,
  [ServiceError.NOT_IMPLEMENTED]: 501,
  [ServiceError.BAD_GATEWAY]: 502,
  [ServiceError.SERVICE_UNAVAILABLE]: 503,
  [ServiceError.GATEWAY_TIMEOUT]: 504,
} satisfies Readonly<Record<ServiceError, number>>;

/** Error-chain hop (semantic breadcrumb) */
export interface ErrorChainItem {
  error: ServiceError;
  error_description: string;
  stage?: string;
  at: number; // epoch ms
}

function titleize(error: ServiceError): string {
  return error
    .split("_")
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * RFC 7807 compatible error payload
 * Content-Type: application/problem+json
 */
export interface ProblemDetails {
  type: string;       // urn:service-error:<id>
  title: string;      // short human-readable title
  status: number;     // HTTP status code
  detail: string;     // detailed error description
  trace?: string;     // correlation / request id
  chain: ReadonlyArray<ErrorChainItem>;
}

/** Debug-only extension (never expose publicly) */
export interface ProblemDetailsDebug extends ProblemDetails {
  cause?: unknown;
  stack?: string;
}

/** K2Error implements the Problem Details output contract */
export class K2Error extends Error {
  public readonly kind = "K2Error" as const;
  public error: ServiceError;
  public code: number;
  public error_description: string;
  public trace?: string;
  public cause?: unknown;
  public sensitive?: unknown; // internal-only, non-enumerable when set via setSensitive()/withSensitive()
  public chain: ErrorChainItem[];

  constructor(
    error: ServiceError,
    errorDescription?: string,
    trace?: string,
    originalError?: unknown
  ) {
    const message =
      errorDescription ||
      (originalError instanceof Error ? originalError.message : undefined) ||
      "An error occurred";

    super(message);

    this.name = "K2Error";
    this.error = error;
    this.code = errorCodes[error] ?? 500;
    this.error_description = message;
    this.trace = trace;
    this.cause = originalError;
    this.chain = [];

    if ("captureStackTrace" in Error) {
      (
        Error as {
          captureStackTrace?: (target: object, ctor?: new (...args: any[]) => unknown) => void;
        }
      ).captureStackTrace?.(this, K2Error);
    }

    Object.setPrototypeOf(this, K2Error.prototype);
  }

  /** RFC7807-compatible payload (public) */
  toJSON(): ProblemDetails {
    return Object.freeze({
      type: `urn:service-error:${this.error}`,
      title: titleize(this.error),
      status: this.code,
      detail: this.error_description,
      trace: this.trace,
      chain: this.chain.slice(),
    });
  }

  toPublicJSON(): ProblemDetails {
    return this.toJSON();
  }

  /** Debug payload (include cause + stack) */
  toDebugJSON(): ProblemDetailsDebug {
    const normCause =
      this.cause instanceof Error
        ? { name: this.cause.name, message: this.cause.message, stack: this.cause.stack }
        : this.cause;

    return Object.freeze({
      ...this.toJSON(),
      cause: normCause,
      stack: this.stack,
    });
  }

  /**
   * Attach internal-only sensitive payload. This is intentionally non-enumerable so it
   * won't accidentally appear in JSON serialization or naive structured logs.
   */
  setSensitive(value: unknown): this {
    Object.defineProperty(this, "sensitive", {
      value,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return this;
  }
}

/** Helper for mapping ServiceError → HTTP status without constructing K2Error */
export function httpStatus(error: ServiceError): number {
  return errorCodes[error] ?? 500;
}

/** Helper: type guard for K2Error */
export function isK2Error(e: unknown): e is K2Error {
  return (
    e instanceof K2Error ||
    (typeof e === "object" &&
      e !== null &&
      ((e as { kind?: unknown }).kind === "K2Error" ||
        (e as { name?: unknown }).name === "K2Error") &&
      "error" in e &&
      "code" in e &&
      "error_description" in e)
  );
}

/** Helper: wrap unknown errors into K2Error without losing trace */
export function wrap(
  err: unknown,
  error: ServiceError = ServiceError.SERVICE_ERROR,
  trace?: string,
  errorDescription?: string
): K2Error {
  if (err instanceof K2Error) return err;

  return new K2Error(
    error,
    errorDescription || (err instanceof Error ? err.message : String(err)),
    trace,
    err instanceof Error ? err : undefined
  );
}

/**
 * Attach a non-enumerable sensitive payload to an error (internal-only).
 * Does not affect the public Problem Details serialization.
 */
export function withSensitive(err: unknown, value: unknown): K2Error {
  const k2 = err instanceof K2Error ? err : wrap(err);
  Object.defineProperty(k2, "sensitive", {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return k2;
}

/**
 * NOTE: Mutates the base K2Error by design (adds a chain hop).
 * This preserves a single error identity across layers.
 */
/** Helper: add a semantic chain hop and return a K2Error to rethrow */
export function chain(
  err: unknown,
  trace?: string,
  errorDescription?: string,
  error?: ServiceError,
  stage?: string
): K2Error {
  const base =
    err instanceof K2Error
      ? err
      : new K2Error(
          error ?? ServiceError.SERVICE_ERROR,
          errorDescription || (err instanceof Error ? err.message : String(err)),
          trace,
          err instanceof Error ? err : undefined
        );

  base.chain.push(
    Object.freeze({
      error: error ?? base.error,
      error_description: errorDescription ?? base.error_description,
      stage,
      at: Date.now(),
    })
  );

  if (error) {
    base.error = error;
    base.code = errorCodes[error] ?? 500;
  }
  if (errorDescription) {
    base.error_description = errorDescription;
  }

  base.trace = trace;
  return base;
}

/** Helper: convenience that throws after chaining */
export function rethrow(
  err: unknown,
  trace?: string,
  errorDescription?: string,
  error?: ServiceError,
  stage?: string
): never {
  throw chain(err, trace, errorDescription, error, stage);
}

/** Helper: attempt an async/sync operation and rethrow with chain */
export async function attempt<T>(
  fn: () => T | Promise<T>,
  trace?: string,
  errorDescription?: string,
  error?: ServiceError,
  stage?: string
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw chain(err, trace, errorDescription, error, stage);
  }
}

export function attemptSync<T>(
  fn: () => T,
  trace?: string,
  errorDescription?: string,
  error?: ServiceError,
  stage?: string
): T {
  try {
    return fn();
  } catch (err) {
    throw chain(err, trace, errorDescription, error, stage);
  }
}

export async function attemptResult<T>(
  fn: () => T | Promise<T>,
  trace?: string,
  errorDescription?: string,
  error?: ServiceError,
  stage?: string
): Promise<{ ok: true; value: T } | { ok: false; error: K2Error }> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: chain(err, trace, errorDescription, error, stage) };
  }
}

/** Assertions (TS "asserts" for strict mode) */
export function assert(
  condition: unknown,
  errorDescription?: string,
  trace?: string,
  error?: ServiceError
): asserts condition {
  if (!condition) {
    throw new K2Error(error ?? ServiceError.VALIDATION_ERROR, errorDescription, trace);
  }
}

export function assertNotNull<T>(
  value: T | null | undefined,
  errorDescription?: string,
  trace?: string,
  error?: ServiceError
): asserts value is T {
  if (value == null) {
    throw new K2Error(error ?? ServiceError.VALIDATION_ERROR, errorDescription, trace);
  }
}

export function invariant(
  condition: unknown,
  errorDescription?: string,
  trace?: string,
  error?: ServiceError
): asserts condition {
  return assert(condition, errorDescription, trace, error);
}

export function serialize(
  err: unknown,
  opts?: { debug?: boolean; trace?: string }
): ProblemDetails | ProblemDetailsDebug {
  const k2 =
    err instanceof K2Error ? err : wrap(err, undefined, opts?.trace);
  return opts?.debug ? k2.toDebugJSON() : k2.toPublicJSON();
}

/**
 * -----------------------
 * OpenAPI snippet (YAML)
 * -----------------------
 *
 * components:
 *   schemas:
 *     ErrorChainItem:
 *       type: object
 *       additionalProperties: false
 *       required: [error, error_description, at]
 *       properties:
 *         error:
 *           type: string
 *           enum:
 *             - validation_error
 *             - invalid_request
 *             - already_exists
 *             - invalid_token
 *             - token_expired
 *             - auth_error
 *             - insufficient_scope
 *             - not_found
 *             - unsupported_method
 *             - system_error
 *             - configuration_error
 *             - service_error
 *             - bad_request
 *             - payment_required
 *             - conflict
 *             - unauthorized
 *             - forbidden
 *             - too_many_requests
 *             - not_implemented
 *             - bad_gateway
 *             - service_unavailable
 *             - gateway_timeout
 *         error_description:
 *           type: string
 *         stage:
 *           type: string
 *         at:
 *           type: integer
 *           format: int64
 *           minimum: 0
 *     ProblemDetails:
 *       type: object
 *       additionalProperties: false
 *       required: [type, title, status, detail, chain]
 *       properties:
 *         type:
 *           type: string
 *           example: urn:service-error:validation_error
 *         title:
 *           type: string
 *           example: validation error
 *         status:
 *           type: integer
 *           format: int32
 *           minimum: 100
 *           maximum: 599
 *           example: 400
 *         detail:
 *           type: string
 *           example: Email is required
 *         trace:
 *           type: string
 *           description: Correlation/trace id
 *         chain:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/ErrorChainItem"
 *
 * responses:
 *   ErrorResponse:
 *     description: Problem Details error
 *     content:
 *       application/problem+json:
 *         schema:
 *           $ref: "#/components/schemas/ProblemDetails"
 */