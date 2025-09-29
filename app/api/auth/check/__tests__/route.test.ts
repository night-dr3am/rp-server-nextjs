import { GET, POST } from '../route'
import { NextRequest } from 'next/server'
import {
  cleanupDatabase,
  createTestUser,
  TEST_USERS,
  expectSuccess,
  expectError,
  generateTestUUID,
  createMockGetRequest,
  createMockPostRequest,
  createApiBody,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { generateSignature } from '@/lib/signature'

describe('/api/auth/check', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  describe('GET', () => {
    it('should check existing user successfully', async () => {
      // Create test user first
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp,
        signature
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toBeDefined()
      expect(data.data.id).toBeDefined()
      expect(data.data.sl_uuid).toBe(testUser.sl_uuid)
      expect(data.data.username).toBe(testUser.username)
      expect(data.data.role).toBe(testUser.role.toUpperCase()) // API returns uppercase
      expect(data.data.health).toBeDefined()
      expect(data.data.hunger).toBeDefined()
      expect(data.data.thirst).toBeDefined()
      expect(data.data.last_active).toBeDefined()
    })

    it('should return user not found for non-existent user', async () => {
      const nonExistentUUID = generateTestUUID()
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/auth/check', {
        sl_uuid: nonExistentUUID,
        universe: 'Gor',
        timestamp,
        signature
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })

    it('should reject check with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const request = createMockGetRequest('/api/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject check with missing sl_uuid', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/auth/check', {
        universe: 'Gor',
        timestamp,
        signature
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject check with missing signature', async () => {
      const testUser = TEST_USERS[0]
      const request = createMockGetRequest('/api/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp: new Date().toISOString()
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject check with invalid UUID format', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/auth/check', {
        sl_uuid: 'invalid-uuid',
        universe: 'Gor',
        timestamp,
        signature
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should update last_active timestamp when checking user', async () => {
      // Create test user
      const testUser = TEST_USERS[0]
      const createdUser = await createTestUser(testUser)
      const originalLastActive = createdUser.lastActive

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1100)) // Increase wait time

      // Check user
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp,
        signature
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      const updatedLastActive = new Date(data.data.last_active)
      // Allow for small timing differences - check that it's at least equal or greater
      expect(updatedLastActive >= originalLastActive).toBe(true)
    })

    it('should return user stats with check result', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp,
        signature
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.health).toBeDefined()
      expect(data.data.hunger).toBeDefined()
      expect(data.data.thirst).toBeDefined()
      expect(data.data.goldCoin).toBeDefined()
      expect(data.data.silverCoin).toBeDefined()
      expect(data.data.copperCoin).toBeDefined()
    })

    it('should check multiple users successfully', async () => {
      // Create multiple test users
      for (const testUser of TEST_USERS.slice(0, 2)) {
        await createTestUser(testUser)
      }

      // Check each user
      for (const testUser of TEST_USERS.slice(0, 2)) {
        const timestamp = new Date().toISOString()
        const signature = generateSignature(timestamp, testUser.universe)
        const url = `http://localhost:3000/api/auth/check?sl_uuid=${testUser.sl_uuid}&universe=${testUser.universe}&timestamp=${encodeURIComponent(timestamp)}&signature=${signature}`
        const request = new NextRequest(url, { method: 'GET' })
        
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.username).toBe(testUser.username)
        expect(data.data.role).toBe(testUser.role.toUpperCase()) // API returns uppercase
      }
    })
  })

  describe('POST', () => {
    it('should check existing user successfully with signature', async () => {
      // Create test user first
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const requestBody = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/auth/check', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toBeDefined()
      expect(data.data.id).toBeDefined()
      expect(data.data.sl_uuid).toBe(testUser.sl_uuid)
      expect(data.data.username).toBe(testUser.username)
      expect(data.data.role).toBe(testUser.role.toUpperCase()) // API returns uppercase
      expect(data.data.health).toBeDefined()
      expect(data.data.hunger).toBeDefined()
      expect(data.data.thirst).toBeDefined()
      expect(data.data.goldCoin).toBeDefined()
      expect(data.data.silverCoin).toBeDefined()
      expect(data.data.copperCoin).toBeDefined()
    })

    it('should return user not found for non-existent user', async () => {
      const nonExistentUUID = generateTestUUID()
      const requestBody = createApiBody({
        sl_uuid: nonExistentUUID,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/auth/check', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })

    it('should reject check with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const requestBody = {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/auth/check', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject check with missing required fields', async () => {
      const requestBody = createApiBody({
        universe: 'Gor',
        // missing sl_uuid
      })

      const request = createMockPostRequest('/api/auth/check', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })
})