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
  testExpectedError,
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
    it('should register a new user successfully', async () => {
      const testUser = TEST_USERS[0]
      const requestBody = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        username: testUser.username,
        role: testUser.role,
      })

      const request = createMockPostRequest('/api/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toBeDefined()
      expect(data.data.id).toBeDefined()
      expect(data.data.sl_uuid).toBe(testUser.sl_uuid)
      expect(data.data.username).toBe(testUser.username)
      expect(data.data.role).toBe('FREE') // API returns uppercase role
      expect(data.data.health).toBe(100)
      expect(data.data.hunger).toBe(100)
      expect(data.data.thirst).toBe(100)
    })

    it('should register multiple users with different roles', async () => {
      for (const testUser of TEST_USERS) {
        const requestBody = createApiBody({
          sl_uuid: testUser.sl_uuid,
          universe: testUser.universe,
          username: testUser.username,
          role: testUser.role,
        })

        const request = createMockPostRequest('/api/auth/register', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.role).toBe(testUser.role.toUpperCase()) // API returns uppercase
        expect(data.data.username).toBe(testUser.username)
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

      const request = createMockPostRequest('/api/auth/register', requestBody)
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

      const request = createMockPostRequest('/api/auth/register', requestBody)
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

      const request = createMockPostRequest('/api/auth/register', requestBody)
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

      const request = createMockPostRequest('/api/auth/register', requestBody)
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
      const request1 = createMockPostRequest('/api/auth/register', requestBody)
      const response1 = await POST(request1)
      const data1 = await parseJsonResponse(response1)
      expectSuccess(data1)

      // Try to register same UUID again - this should trigger a database constraint error
      await testExpectedError('Duplicate UUID registration (Prisma constraint error may appear)', async () => {
        const duplicateRequestBody = createApiBody({
          sl_uuid: testUser.sl_uuid,
          universe: testUser.universe,
          username: 'DifferentUsername',
          role: 'JARL',
        })
        
        const request2 = createMockPostRequest('/api/auth/register', duplicateRequestBody)
        const response2 = await POST(request2)
        const data2 = await parseJsonResponse(response2)

        expectError(data2)
        expect(response2.status).toBe(400) // Prisma constraint violation returns 400
      })
    })

    it('should reject invalid role case', async () => {
      const requestBody = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
        username: generateTestUsername(),
        role: 'free', // lowercase - should be rejected
      })

      const request = createMockPostRequest('/api/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'must be one of')
      expect(response.status).toBe(400)
    })

    it('should create user with default stats values', async () => {
      const requestBody = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
        username: generateTestUsername(),
        role: 'Slave', // Use proper case for validation
      })

      const request = createMockPostRequest('/api/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.health).toBe(100)
      expect(data.data.hunger).toBe(100)
      expect(data.data.thirst).toBe(100)
      expect(data.data.goldCoin).toBe(0)
      expect(data.data.silverCoin).toBe(0)
      expect(data.data.copperCoin).toBe(10) // Default value per schema
      expect(data.data.role).toBe('SLAVE') // API returns uppercase
    })

    it('should allow same UUID to register in different universes', async () => {
      const uuid = generateTestUUID()

      // Register in Gor universe
      const gorRequestBody = createApiBody({
        sl_uuid: uuid,
        universe: 'Gor',
        username: 'GorUser',
        role: 'Free',
      })

      const gorRequest = createMockPostRequest('/api/auth/register', gorRequestBody)
      const gorResponse = await POST(gorRequest)
      const gorData = await parseJsonResponse(gorResponse)

      expectSuccess(gorData)
      expect(gorData.data.universe).toBe('Gor')
      expect(gorData.data.username).toBe('GorUser')

      // Register same UUID in Arkana universe
      const arkanaRequestBody = createApiBody({
        sl_uuid: uuid,
        universe: 'Arkana',
        username: 'ArkanaUser',
        role: 'Jarl',
      }, 'Arkana')

      const arkanaRequest = createMockPostRequest('/api/auth/register', arkanaRequestBody)
      const arkanaResponse = await POST(arkanaRequest)
      const arkanaData = await parseJsonResponse(arkanaResponse)

      expectSuccess(arkanaData)
      expect(arkanaData.data.universe).toBe('Arkana')
      expect(arkanaData.data.username).toBe('ArkanaUser')
      expect(arkanaData.data.sl_uuid).toBe(uuid)
    })

    it('should reject registration without universe parameter', async () => {
      const requestBody = createApiBody({
        sl_uuid: generateTestUUID(),
        username: 'TestUser',
        role: 'Free',
        // missing universe
      })
      delete requestBody.universe // Explicitly remove universe field

      const request = createMockPostRequest('/api/auth/register', requestBody)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })
})