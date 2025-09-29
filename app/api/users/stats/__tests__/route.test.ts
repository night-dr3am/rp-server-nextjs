import { GET, POST } from '../route'
import {
  createMockGetRequest,
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  createTestUser,
  TEST_USERS,
  expectSuccess,
  expectError,
  generateTestUUID,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { generateSignature } from '@/lib/signature'

describe('/api/users/stats', () => {
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
    it('should retrieve user stats successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/users/stats', {
        sl_uuid: testUser.sl_uuid,
        timestamp,
        signature,
        universe: testUser.universe
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toBeDefined()
      expect(data.data.health).toBe(100)
      expect(data.data.hunger).toBe(100)
      expect(data.data.thirst).toBe(100)
      expect(data.data.goldCoin).toBe(10)
      expect(data.data.silverCoin).toBe(50)
      expect(data.data.copperCoin).toBe(100)
      expect(data.data.username).toBe(testUser.username)
      expect(data.data.role).toBe(testUser.role.toUpperCase()) // API returns uppercase
      expect(data.data.last_updated).toBeDefined()
    })

    it('should return stats not found for non-existent user', async () => {
      const nonExistentUUID = generateTestUUID()
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/users/stats', {
        sl_uuid: nonExistentUUID,
        timestamp,
        signature,
        universe: 'Gor'
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User stats not found')
      expect(response.status).toBe(404)
    })

    it('should reject get stats with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const request = createMockGetRequest('/api/users/stats', {
        sl_uuid: testUser.sl_uuid,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        universe: testUser.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject get stats with missing parameters', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/users/stats', {
        timestamp,
        signature,
        universe: 'Gor'
      })
      
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })

  describe('POST', () => {
    it('should update user stats successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const updateData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        health: 85,
        hunger: 70,
        thirst: 90,
        goldCoin: 15,
        silverCoin: 75,
        copperCoin: 125,
      })

      const request = createMockPostRequest('/api/users/stats', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toBeDefined()
      expect(data.data.health).toBe(85)
      expect(data.data.hunger).toBe(70)
      expect(data.data.thirst).toBe(90)
      expect(data.data.goldCoin).toBe(15)
      expect(data.data.silverCoin).toBe(75)
      expect(data.data.copperCoin).toBe(125)
    })

    it('should update partial stats successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // Update only health and hunger
      const updateData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        health: 95,
        hunger: 80,
      })

      const request = createMockPostRequest('/api/users/stats', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.health).toBe(95)
      expect(data.data.hunger).toBe(80)
      // Other stats should remain unchanged
      expect(data.data.thirst).toBe(100)
      expect(data.data.goldCoin).toBe(10)
    })

    it('should clamp stats values to valid ranges', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // Try to set values outside valid ranges
      const updateData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        health: 150, // Should be clamped to 100
        hunger: -10, // Should be clamped to 0
        thirst: 200, // Should be clamped to 100
      })

      const request = createMockPostRequest('/api/users/stats', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.health).toBe(100) // Clamped to max
      expect(data.data.hunger).toBe(0)   // Clamped to min
      expect(data.data.thirst).toBe(100) // Clamped to max
    })

    it('should reject update with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const updateData = {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        health: 95,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/users/stats', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject update for non-existent user', async () => {
      await testExpectedError('Update stats for non-existent user (Prisma error is expected)', async () => {
        const updateData = createApiBody({
          sl_uuid: generateTestUUID(),
          universe: 'Gor',
          health: 95,
          hunger: 80,
        })

        const request = createMockPostRequest('/api/users/stats', updateData)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'User not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject update with invalid UUID format', async () => {
      const updateData = createApiBody({
        sl_uuid: 'invalid-uuid',
        health: 95,
      })

      const request = createMockPostRequest('/api/users/stats', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should handle negative currency values', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // Set negative currency values (should be allowed for debts)
      const updateData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: -5,
        silverCoin: -10,
        copperCoin: -20,
      })

      const request = createMockPostRequest('/api/users/stats', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.goldCoin).toBe(-5)
      expect(data.data.silverCoin).toBe(-10)
      expect(data.data.copperCoin).toBe(-20)
    })

    it('should update multiple users independently', async () => {
      // Create multiple users
      for (const testUser of TEST_USERS.slice(0, 2)) {
        await createTestUser(testUser)
      }

      // Update each user with different values
      const updateData1 = createApiBody({
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        health: 80,
        goldCoin: 20,
      })
      const updateData2 = createApiBody({
        sl_uuid: TEST_USERS[1].sl_uuid,
        universe: TEST_USERS[1].universe,
        health: 90,
        goldCoin: 30,
      })

      const request1 = createMockPostRequest('/api/users/stats', updateData1)
      const response1 = await POST(request1)
      const data1 = await response1.json()

      const request2 = createMockPostRequest('/api/users/stats', updateData2)
      const response2 = await POST(request2)
      const data2 = await response2.json()

      expectSuccess(data1)
      expectSuccess(data2)
      expect(data1.data.health).toBe(80)
      expect(data1.data.goldCoin).toBe(20)
      expect(data2.data.health).toBe(90)
      expect(data2.data.goldCoin).toBe(30)
    })
  })
})