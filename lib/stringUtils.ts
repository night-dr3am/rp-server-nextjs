/**
 * String utilities for LSL-safe data formatting
 *
 * LSL (Linden Scripting Language) uses pipe-delimited messages, so we need to
 * sanitize strings to prevent parsing errors in Second Life scripts.
 */

/**
 * Sanitizes a string for use in LSL pipe-delimited messages
 *
 * @param value - The string to sanitize (can be null/undefined)
 * @param maxLength - Maximum length before truncation (default: 50)
 * @returns Sanitized string with pipes removed, truncated if needed, with "..." if truncated
 *
 * @example
 * sanitizeForLSL("Hello | World", 20) // "Hello - World"
 * sanitizeForLSL("Very long text that exceeds the limit", 20) // "Very long text th..."
 * sanitizeForLSL(null, 50) // ""
 */
export function sanitizeForLSL(value: string | null | undefined, maxLength: number = 50): string {
  // Handle null/undefined
  if (!value) {
    return "";
  }

  // Replace all pipe characters with dash
  let sanitized = value.replace(/\|/g, "-");

  // Truncate if needed
  if (sanitized.length > maxLength) {
    // Subtract 3 for the "..." suffix
    const truncateAt = maxLength - 3;
    sanitized = sanitized.substring(0, truncateAt) + "...";
  }

  return sanitized;
}
