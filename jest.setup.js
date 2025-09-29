// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Add custom jest matchers from jest-dom
import '@testing-library/jest-dom'

// Load environment variables for testing
import { config } from 'dotenv'

// Load test environment variables
config({ path: '.env.test' })

// Ensure we're in test mode
process.env.NODE_ENV = 'test'

// Mock console methods in test environment to reduce noise
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    // uncomment to ignore a specific log level
    // log: jest.fn(),
    // debug: jest.fn(),
    // info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}

// Global test setup
beforeAll(async () => {
  // Any global setup that needs to happen before all tests
})

afterAll(async () => {
  // Any global cleanup that needs to happen after all tests
})