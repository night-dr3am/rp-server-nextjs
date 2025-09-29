/**
 * Test Configuration
 * Centralizes all test configuration to avoid hardcoded values
 */

export interface TestConfig {
  baseUrl: string
  port: number
  host: string
  protocol: string
}

/**
 * Get test configuration from environment variables
 */
export function getTestConfig(): TestConfig {
  const port = parseInt(process.env.PORT || '3001', 10)
  const host = process.env.TEST_HOST || 'localhost'
  const protocol = process.env.TEST_PROTOCOL || 'http'
  
  return {
    baseUrl: `${protocol}://${host}:${port}`,
    port,
    host,
    protocol,
  }
}

/**
 * Build API URL for testing
 */
export function buildApiUrl(path: string): string {
  const config = getTestConfig()
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${config.baseUrl}${cleanPath}`
}

/**
 * Build API URL with query parameters
 */
export function buildApiUrlWithQuery(path: string, params: Record<string, string>): string {
  const baseUrl = buildApiUrl(path)
  const searchParams = new URLSearchParams(params)
  return `${baseUrl}?${searchParams.toString()}`
}

/**
 * Default test configuration constants
 */
export const TEST_CONFIG = getTestConfig()