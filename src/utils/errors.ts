export class UnauthorizedError extends Error {
  code = "UNAUTHORIZED";
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  code = "FORBIDDEN";
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  code = "NOT_FOUND";
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  code = "VALIDATION_ERROR";
  constructor(message = "Validation Error") {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  code = "CONFLICT";
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}
