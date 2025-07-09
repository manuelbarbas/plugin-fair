/**
 * Safely extracts an error message from an unknown error type
 * @param error - The error object of unknown type
 * @returns A string representation of the error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  // Handle other types (objects, numbers, etc.)
  try {
    return String(error);
  } catch {
    return 'Unknown error occurred';
  }
}

/**
 * Creates a standardized error with proper message handling
 * @param message - Base error message
 * @param originalError - The original error that caused this
 * @returns A new Error object with combined message
 */
export function createErrorWithContext(message: string, originalError: unknown): Error {
  const originalMessage = getErrorMessage(originalError);
  return new Error(`${message}: ${originalMessage}`);
}

/**
 * Logs an error with consistent formatting
 * @param context - Context string (e.g., 'BITE')
 * @param message - Base message
 * @param error - The error to log
 */
export function logError(context: string, message: string, error: unknown): void {
  const errorMessage = getErrorMessage(error);
  console.error(`${context}: ${message} - ${errorMessage}`);
}
