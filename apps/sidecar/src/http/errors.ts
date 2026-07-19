export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INTERNAL: 'INTERNAL',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  INVALID_DRIVE_KEY: 'INVALID_DRIVE_KEY',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface SidecarErrorBody {
  error: {
    code: ErrorCodeValue;
    message: string;
    details?: unknown;
  };
}

export class SidecarError extends Error {
  constructor(
    public readonly code: ErrorCodeValue,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SidecarError';
  }
}

export function toErrorBody(err: SidecarError): SidecarErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
}

export function httpStatusFor(code: ErrorCodeValue): number {
  switch (code) {
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.BAD_REQUEST:
    case ErrorCode.INVALID_DRIVE_KEY:
      return 400;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.ALREADY_EXISTS:
      return 409;
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 503;
    case ErrorCode.TIMEOUT:
      return 504;
    case ErrorCode.INTERNAL:
    default:
      return 500;
  }
}
