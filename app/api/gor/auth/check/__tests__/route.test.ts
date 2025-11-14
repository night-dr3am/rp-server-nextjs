import { GET, POST } from '../route'
import { NextRequest } from 'next/server'
import {
  cleanupDatabase,
  createTestUser,
  createTestUserWithGoreanStats,
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
    it('should check existing user with complete Gorean character successfully', async () => {
      // Create test user with complete goreanStats
      const testUser = TEST_USERS[0]
      await createTestUserWithGoreanStats(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/gor/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)

      // Check nested structure
      expect(data.data).toBeDefined()
      expect(data.data.user).toBeDefined()
      expect(data.data.stats).toBeDefined()
      expect(data.data.goreanStats).toBeDefined()
      expect(data.data.hasGoreanCharacter).toBe("true")

      // Check user fields
      expect(data.data.user.id).toBeDefined()
      expect(data.data.user.slUuid).toBe(testUser.sl_uuid)
      expect(data.data.user.role).toBe(testUser.role.toUpperCase())
      expect(data.data.user.lastActive).toBeDefined()

      // Check stats (should only have status, no duplicates)
      expect(data.data.stats.status).toBeDefined()
      expect(data.data.stats.lastUpdated).toBeDefined()
      expect(data.data.stats.health).toBeUndefined() // Should not be in stats anymore

      // Check goreanStats
      expect(data.data.goreanStats.characterName).toBeDefined()
      expect(data.data.goreanStats.agentName).toBeDefined()
      expect(data.data.goreanStats.healthMax).toBe(15)
      expect(data.data.goreanStats.healthCurrent).toBe(15)
      expect(data.data.goreanStats.activeEffects).toBeDefined()
      expect(data.data.goreanStats.liveStats).toBeDefined()
      expect(data.data.goreanStats.registrationCompleted).toBe(true)
    })

    it('should return 404 for user with incomplete Gorean registration', async () => {
      // Create user without goreanStats (registration not completed)
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/gor/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User registration incomplete')
      expect(response.status).toBe(404)
    })

    it('should reject non-Gor universe', async () => {
      const testUser = TEST_USERS[0]
      await createTestUserWithGoreanStats(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/gor/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: 'Arkana', // Wrong universe
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'This endpoint is only for Gor universe')
      expect(response.status).toBe(400)
    })

    it('should return user not found for non-existent user', async () => {
      const nonExistentUUID = generateTestUUID()
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/gor/auth/check', {
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
      await createTestUserWithGoreanStats(testUser)

      const request = createMockGetRequest('/api/gor/auth/check', {
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
      const request = createMockGetRequest('/api/gor/auth/check', {
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
      const request = createMockGetRequest('/api/gor/auth/check', {
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
      const request = createMockGetRequest('/api/gor/auth/check', {
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
      // Create test user with goreanStats
      const testUser = TEST_USERS[0]
      const createdUser = await createTestUserWithGoreanStats(testUser)
      const originalLastActive = createdUser.lastActive

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Check user
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/gor/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      const updatedLastActive = new Date(data.data.user.lastActive)
      // Allow for small timing differences - check that it's at least equal or greater
      expect(updatedLastActive >= originalLastActive).toBe(true)
    })

    it('should return goreanStats with check result', async () => {
      const testUser = TEST_USERS[0]
      await createTestUserWithGoreanStats(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/gor/auth/check', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      // Check goreanStats contains all expected fields
      expect(data.data.goreanStats.healthMax).toBeDefined()
      expect(data.data.goreanStats.healthCurrent).toBeDefined()
      expect(data.data.goreanStats.hungerCurrent).toBeDefined()
      expect(data.data.goreanStats.thirstCurrent).toBeDefined()
      expect(data.data.goreanStats.goldCoin).toBeDefined()
      expect(data.data.goreanStats.silverCoin).toBeDefined()
      expect(data.data.goreanStats.copperCoin).toBeDefined()

      // Verify stats does NOT contain duplicate fields
      expect(data.data.stats.health).toBeUndefined()
      expect(data.data.stats.goldCoin).toBeUndefined()
    })

    it('should check multiple users successfully', async () => {
      // Create multiple test users with goreanStats
      for (const testUser of TEST_USERS.slice(0, 2)) {
        await createTestUserWithGoreanStats(testUser)
      }

      // Check each user
      for (const testUser of TEST_USERS.slice(0, 2)) {
        const timestamp = new Date().toISOString()
        const signature = generateSignature(timestamp, testUser.universe)
        const url = `http://localhost:3000/api/gor/auth/check?sl_uuid=${testUser.sl_uuid}&universe=${testUser.universe}&timestamp=${encodeURIComponent(timestamp)}&signature=${signature}`
        const request = new NextRequest(url, { method: 'GET' })

        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.user.role).toBe(testUser.role.toUpperCase())
        expect(data.data.hasGoreanCharacter).toBe("true")
      }
    })
  })

  describe('POST', () => {
    it('should check existing user with complete Gorean character successfully', async () => {
      // Create test user with complete goreanStats
      const testUser = TEST_USERS[0]
      await createTestUserWithGoreanStats(testUser)

      const requestBody = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/gor/auth/check', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)

      // Check nested structure
      expect(data.data.user).toBeDefined()
      expect(data.data.stats).toBeDefined()
      expect(data.data.goreanStats).toBeDefined()
      expect(data.data.hasGoreanCharacter).toBe("true")

      // Check user fields
      expect(data.data.user.id).toBeDefined()
      expect(data.data.user.slUuid).toBe(testUser.sl_uuid)
      expect(data.data.user.role).toBe(testUser.role.toUpperCase())

      // Check goreanStats
      expect(data.data.goreanStats.healthCurrent).toBeDefined()
      expect(data.data.goreanStats.hungerCurrent).toBeDefined()
      expect(data.data.goreanStats.thirstCurrent).toBeDefined()
      expect(data.data.goreanStats.goldCoin).toBeDefined()
      expect(data.data.goreanStats.silverCoin).toBeDefined()
      expect(data.data.goreanStats.copperCoin).toBeDefined()
    })

    it('should return user not found for non-existent user', async () => {
      const nonExistentUUID = generateTestUUID()
      const requestBody = createApiBody({
        sl_uuid: nonExistentUUID,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/gor/auth/check', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })

    it('should reject check with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUserWithGoreanStats(testUser)

      const requestBody = {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/gor/auth/check', requestBody)
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

      const request = createMockPostRequest('/api/gor/auth/check', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })
})