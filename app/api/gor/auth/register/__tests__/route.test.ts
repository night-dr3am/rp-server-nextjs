import { POST } from '../route'
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  TEST_USERS,
  expectSuccess,
  expectError,
  generateTestUUID,
  generateTestUsername,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'

describe('/api/auth/register', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  describe('POST', () => {
    it('should register a new user successfully with nested structure', async () => {
      const testUser = TEST_USERS[0]
      const requestBody = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        username: testUser.username,
        role: testUser.role,
      })

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(201)

      // Check nested structure
      expect(data.data.user).toBeDefined()
      expect(data.data.stats).toBeDefined()
      expect(data.data.goreanStats).toBeNull()
      expect(data.data.hasGoreanCharacter).toBe("false")
      expect(data.data.message).toBe('User registered successfully in Gor universe')

      // Check user fields
      expect(data.data.user.id).toBeDefined()
      expect(data.data.user.slUuid).toBe(testUser.sl_uuid)
      expect(data.data.user.role).toBe('FREE')
      expect(data.data.user.universe).toBe(testUser.universe)

      // Check stats (should only have status, no duplicate fields)
      expect(data.data.stats.status).toBeDefined()
      expect(data.data.stats.health).toBeUndefined() // Should not be in stats
    })

    it('should reject non-Gor universe registration', async () => {
      const testUser = TEST_USERS[0]
      const requestBody = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: 'Arkana', // Wrong universe for this endpoint
        username: testUser.username,
        role: testUser.role,
      }, 'Arkana') // Use Arkana signature

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'This endpoint is only for Gor universe registration')
      expect(response.status).toBe(400)
    })

    it('should register multiple users with different roles', async () => {
      for (const testUser of TEST_USERS) {
        const requestBody = createApiBody({
          sl_uuid: testUser.sl_uuid,
          universe: testUser.universe,
          username: testUser.username,
          role: testUser.role,
        })

        const request = createMockPostRequest('/api/gor/auth/register', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.user.role).toBe(testUser.role.toUpperCase())
        expect(data.data.hasGoreanCharacter).toBe("false")
      }
    })

    it('should reject registration with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      const requestBody = {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        username: testUser.username,
        role: testUser.role,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject registration with missing required fields', async () => {
      const requestBody = createApiBody({
        username: 'TestUser',
        role: 'FREE',
        universe: 'Gor',
        // missing sl_uuid
      })

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject registration with invalid UUID format', async () => {
      const requestBody = createApiBody({
        sl_uuid: 'invalid-uuid-format',
        universe: 'Gor',
        username: 'TestUser',
        role: 'FREE',
      })

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject registration with invalid role', async () => {
      const requestBody = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
        username: 'TestUser',
        role: 'INVALID_ROLE',
      })

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject duplicate UUID registration', async () => {
      const testUser = TEST_USERS[0]
      const requestBody = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        username: testUser.username,
        role: testUser.role,
      })

      // Register user first time
      const request1 = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response1 = await POST(request1)
      const data1 = await parseJsonResponse(response1)
      expectSuccess(data1)
      expect(response1.status).toBe(201)

      // Try to register same UUID again - should get 409 conflict
      const duplicateRequestBody = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        username: 'DifferentUsername',
        role: 'Jarl', // Use proper title case
      })

      const request2 = createMockPostRequest('/api/gor/auth/register', duplicateRequestBody)
      const response2 = await POST(request2)
      const data2 = await parseJsonResponse(response2)

      expectError(data2, 'User already registered')
      expect(response2.status).toBe(409)
    })

    it('should reject invalid role case', async () => {
      const requestBody = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
        username: generateTestUsername(),
        role: 'free', // lowercase - should be rejected
      })

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'must be one of')
      expect(response.status).toBe(400)
    })

    it('should reject registration without universe parameter', async () => {
      const requestBody = createApiBody({
        sl_uuid: generateTestUUID(),
        username: 'TestUser',
        role: 'Free',
        // missing universe
      })
      delete requestBody.universe // Explicitly remove universe field

      const request = createMockPostRequest('/api/gor/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })
})