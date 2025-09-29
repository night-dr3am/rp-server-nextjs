import { prisma } from '@/lib/prisma'
import { cleanupDatabase } from './test-helpers'

// Global test setup function
export async function setupTestDatabase(): Promise<void> {
  // Ensure we're in test environment
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test database setup should only run in test environment')
  }

  try {
    // Test database connection
    await prisma.$connect()
    console.log('✅ Connected to test database')

    // Clean up any existing test data
    await cleanupDatabase()
    console.log('✅ Test database cleaned')
  } catch (error) {
    console.error('❌ Failed to setup test database:', error)
    throw error
  }
}

// Global test cleanup function
export async function teardownTestDatabase(): Promise<void> {
  try {
    // Clean up test data
    await cleanupDatabase()
    
    // Disconnect from database
    await prisma.$disconnect()
    console.log('✅ Disconnected from test database')
  } catch (error) {
    console.error('❌ Failed to teardown test database:', error)
    throw error
  }
}

// Function to reset database between test suites
export async function resetTestDatabase(): Promise<void> {
  try {
    await cleanupDatabase()
    console.log('✅ Test database reset')
  } catch (error) {
    console.error('❌ Failed to reset test database:', error)
    throw error
  }
}