import crypto from 'crypto';

/**
 * Universe-specific secret keys
 */
const UNIVERSE_SECRET_KEYS = {
  gor: process.env.NODE_ENV === 'test'
    ? process.env.TEST_GOR_UNIVERSE_SECRET_KEY
    : process.env.GOR_UNIVERSE_SECRET_KEY,
  arkana: process.env.NODE_ENV === 'test'
    ? process.env.TEST_ARKANA_UNIVERSE_SECRET_KEY
    : process.env.ARKANA_UNIVERSE_SECRET_KEY,
} as const;

/**
 * Signature validation result
 */
export interface SignatureValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Get secret key for the specified universe
 */
function getUniverseSecretKey(universe: string): string | undefined {
  const normalizedUniverse = universe.toLowerCase();

  switch (normalizedUniverse) {
    case 'gor':
      return UNIVERSE_SECRET_KEYS.gor;
    case 'arkana':
      return UNIVERSE_SECRET_KEYS.arkana;
    default:
      return undefined;
  }
}

/**
 * Generate SHA256 signature for timestamp + secret key
 */
export function generateSignature(timestamp: string, universe: string): string {
  const secretKey = getUniverseSecretKey(universe);
  if (!secretKey) {
    throw new Error(`No secret key configured for universe: ${universe}`);
  }

  const data = timestamp + secretKey;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate timestamp format (ISO 8601)
 */
function isValidTimestamp(timestamp: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
  if (!iso8601Regex.test(timestamp)) {
    return false;
  }

  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

/**
 * Check if timestamp is within acceptable time window (5 minutes)
 */
function isTimestampWithinWindow(timestamp: string, windowMinutes: number = 5): boolean {
  const requestTime = new Date(timestamp);
  const currentTime = new Date();
  const timeDifferenceMs = Math.abs(currentTime.getTime() - requestTime.getTime());
  const timeDifferenceMinutes = timeDifferenceMs / (1000 * 60);

  return timeDifferenceMinutes <= windowMinutes;
}

/**
 * Validate signature against timestamp and universe
 */
export function validateSignature(
  timestamp: string,
  signature: string,
  universe: string
): SignatureValidationResult {
  // Validate timestamp format
  if (!isValidTimestamp(timestamp)) {
    return {
      valid: false,
      error: 'Invalid timestamp format. Expected ISO 8601 format (YYYY-MM-DDThh:mm:ss.fffZ)'
    };
  }

  // Check timestamp window
  if (!isTimestampWithinWindow(timestamp)) {
    return {
      valid: false,
      error: 'Timestamp is outside acceptable time window (5 minutes)'
    };
  }

  // Get universe secret key
  const secretKey = getUniverseSecretKey(universe);
  if (!secretKey) {
    return {
      valid: false,
      error: `No secret key configured for universe: ${universe}`
    };
  }

  // Generate expected signature
  try {
    const expectedSignature = generateSignature(timestamp, universe);

    // Compare signatures using constant-time comparison
    if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return { valid: true };
    } else {
      return {
        valid: false,
        error: 'Invalid signature'
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Signature validation failed'
    };
  }
}

/**
 * Generate current timestamp in ISO 8601 format for testing
 */
export function generateTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate Unix timestamp format and window
 */
function isValidUnixTimestamp(timestamp: string): boolean {
  const unixTime = parseInt(timestamp, 10);
  if (isNaN(unixTime) || unixTime <= 0) {
    return false;
  }

  // Check if timestamp is within reasonable range (not too far in past or future)
  const currentTime = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(currentTime - unixTime);

  // Allow 5 minutes window (300 seconds)
  return timeDifference <= 300;
}

/**
 * Generate signature for Unix timestamp + secret key (LSL format)
 */
export function generateUnixSignature(unixTimestamp: string, universe: string): string {
  const secretKey = getUniverseSecretKey(universe);
  if (!secretKey) {
    throw new Error(`No secret key configured for universe: ${universe}`);
  }

  const data = unixTimestamp + secretKey;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate Unix timestamp signature (for LSL scripts)
 */
export function validateUnixSignature(
  unixTimestamp: string,
  signature: string,
  universe: string
): SignatureValidationResult {
  // Validate Unix timestamp format
  if (!isValidUnixTimestamp(unixTimestamp)) {
    return {
      valid: false,
      error: 'Invalid Unix timestamp or timestamp outside acceptable time window (5 minutes)'
    };
  }

  // Get universe secret key
  const secretKey = getUniverseSecretKey(universe);
  if (!secretKey) {
    return {
      valid: false,
      error: `No secret key configured for universe: ${universe}`
    };
  }

  // Generate expected signature
  try {
    const expectedSignature = generateUnixSignature(unixTimestamp, universe);

    // Compare signatures using constant-time comparison
    if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return { valid: true };
    } else {
      return {
        valid: false,
        error: 'Invalid signature'
      };
    }
  } catch {
    return {
      valid: false,
      error: 'Signature validation failed'
    };
  }
}

/**
 * Helper function to create request body with signature for testing
 */
export function createSignedRequest(data: Record<string, unknown>, universe: string): Record<string, unknown> {
  const timestamp = generateTimestamp();
  const signature = generateSignature(timestamp, universe);

  return {
    ...data,
    timestamp,
    signature
  };
}