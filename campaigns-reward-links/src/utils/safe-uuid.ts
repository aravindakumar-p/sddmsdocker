import crypto from 'crypto';

/**
 * Generates a cryptographically secure UUID
 */
export function safeUUID(): string {
  return crypto.randomUUID(); // Node.js 14.17+
}