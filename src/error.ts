// src/errors/ApplicationError.ts

/**
 * Enum representing various ServiceError types.
 */
export enum K2Error {
  VALIDATION_ERROR = "validation_error",
  INVALID_REQUEST = "invalid_request",
  ALREADY_EXISTS = "already_exists",
  INVALID_TOKEN = "invalid_token",
  AUTH_ERROR = "auth_error",
  INSUFFICIENT_SCOPE = "insufficient_scope",
  NOT_FOUND = "not_found",
  UNSUPPORTED_METHOD = "unsupported_method",
  SYSTEM_ERROR = "system_error",
  CONFIGURATION_ERROR = "configuration_error",
  SERVICE_ERROR = "service_error",
}

/**
 * Mapping of error identifiers to HTTP status codes.
 */
const errorCodes: Record<string, number> = {
  validation_error: 400, // When passed data fails validation
  invalid_request: 400, // The request is malformed or has invalid parameters
  already_exists: 400, // When inserting data that already exists
  invalid_token: 401, // When the access token is invalid or expired
  auth_error: 403, // When authentication fails
  insufficient_scope: 403, // When the request requires higher privileges
  not_found: 404, // When a record is not found
  unsupported_method: 405, // When an HTTP method is not supported
  data_error: 409, // Conflict error
  system_error: 500, // Internal system error
  configuration_error: 500, // Configuration-related errors
  service_error: 502, // When calling a remote service fails
};

/**
 * Custom ApplicationError class extending the native Error class.
 */
export class ApplicationError extends Error {
  public code: number;
  public error_description: string;
  public trace: string;
  public error: string;

  /**
   * Constructs a new ApplicationError instance.
   * @param error - The error identifier.
   * @param errorDescription - A descriptive message for the error.
   * @param trace - A unique trace identifier for debugging.
   * @param originalError - An optional original error for internal use.
   */
  constructor(
    error: string,
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
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }

  /**
   * Sends the error response to the client.
   * @param res - The Express response object.
   */
  public send(res: any): void {
    res.status(this.code).json({
      error: this.error,
      error_description: this.error_description,
      trace: this.trace,
    });
  }
}

/**
 * Sends an error response based on the provided error object.
 * @param err - The error object, which can be an instance of ApplicationError or any other error.
 * @param res - The Express response object.
 * @param logger - An optional logger instance for logging errors.
 * @param trace - An optional trace identifier for debugging.
 */
export const sendError = (
  err: any,
  res: any,
  logger?: any,
  trace?: string
): void => {
  if (err instanceof ApplicationError) {
    err.send(res);
    return;
  }

  // Log the error using the provided logger or default to console.error
  if (logger) {
    logger.error(err);
  } else {
    console.error(err);
  }

  // Create and send a generic system error
  const systemError = new ApplicationError(
    K2Error.SYSTEM_ERROR,
    "Internal system error occurred, administrator was notified",
    trace || "sys_int_helper"
  );
  systemError.send(res);
};
