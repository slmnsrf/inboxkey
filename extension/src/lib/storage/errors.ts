/**
 * Custom error types for storage operations
 */

export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "StorageError"
    Object.setPrototypeOf(this, StorageError.prototype)
  }
}

export class DecryptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "DecryptionError"
    Object.setPrototypeOf(this, DecryptionError.prototype)
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message)
    this.name = "ValidationError"
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = "MigrationError"
    Object.setPrototypeOf(this, MigrationError.prototype)
  }
}
