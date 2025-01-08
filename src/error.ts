// Enum representing various ServiceError types
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

// Mapping of error identifiers to HTTP status codes
const errorCodes: Record<ServiceError, number> = {
  [ServiceError.BAD_REQUEST]: 400,
  [ServiceError.VALIDATION_ERROR]: 400,
  [ServiceError.INVALID_REQUEST]: 400,
  [ServiceError.ALREADY_EXISTS]: 400,
  [ServiceError.INVALID_TOKEN]: 401,
  [ServiceError.TOKEN_EXPIRED]: 401,
  [ServiceError.UNAUTHORIZED]: 401,
  [ServiceError.PAYMENT_REQUIRED]: 402,
  [ServiceError.AUTH_ERROR]: 403,
  [ServiceError.FORBIDDEN]: 403,
  [ServiceError.INSUFFICIENT_SCOPE]: 403,
  [ServiceError.NOT_FOUND]: 404,
  [ServiceError.UNSUPPORTED_METHOD]: 405,
  [ServiceError.CONFLICT]: 409,
  [ServiceError.TOO_MANY_REQUESTS]: 429,
  [ServiceError.SYSTEM_ERROR]: 500,
  [ServiceError.CONFIGURATION_ERROR]: 500,
  [ServiceError.NOT_IMPLEMENTED]: 501,
  [ServiceError.SERVICE_ERROR]: 502,
  [ServiceError.BAD_GATEWAY]: 502,
  [ServiceError.SERVICE_UNAVAILABLE]: 503,
  [ServiceError.GATEWAY_TIMEOUT]: 504,
};

// Custom ApplicationError class extending the native Error class
export class K2Error extends Error {
  public code: number;
  public error_description: string;
  public trace: string;
  public error: ServiceError;

  constructor(
    error: ServiceError,
    errorDescription: string,
    trace: string,
    originalError?: Error
  ) {
    super(errorDescription || originalError?.message || "An error occurred");
    this.error = error;
    this.code = errorCodes[error] || 500;
    this.error_description =
      errorDescription || originalError?.message || "An error occurred";
    this.trace = trace;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, K2Error.prototype);
  }
}
