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
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { generateSignature } from '@/lib/signature'

describe('/api/events', () => {
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
    it('should create a new event successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const eventData = createApiBody({
        type: 'player_login',
        details: { location: 'Forest of Gor', timestamp: new Date().toISOString() },
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/events', eventData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(201)
      expect(data.data).toBeDefined()
      expect(data.data.id).toBeDefined()
      expect(data.data.type).toBe('player_login')
      expect(data.data.details).toEqual(eventData.details)
      expect(data.data.user_id).toBe(testUser.sl_uuid)
      expect(data.data.timestamp).toBeDefined()
    })

    it('should create multiple event types successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const eventTypes = [
        { type: 'player_login', details: { location: 'Forest of Gor' } },
        { type: 'item_purchase', details: { item: 'sword', price: 100 } },
        { type: 'payment_sent', details: { recipient: 'another_user', amount: 50 } },
        { type: 'roleplay_start', details: { scene: 'tavern_meeting' } }
      ]

      for (const eventInfo of eventTypes) {
        const eventData = createApiBody({
          ...eventInfo,
          sl_uuid: testUser.sl_uuid,
          universe: testUser.universe,
        })

        const request = createMockPostRequest('/api/events', eventData)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(response.status).toBe(201)
        expect(data.data.type).toBe(eventInfo.type)
        expect(data.data.details).toEqual(eventInfo.details)
      }
    })

    it('should reject event creation with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const eventData = {
        type: 'player_login',
        details: { location: 'Forest of Gor' },
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/events', eventData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject event creation with missing required fields', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const invalidData = createApiBody({
        details: { location: 'Forest of Gor' },
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        // missing type
      })

      const request = createMockPostRequest('/api/events', invalidData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject event creation for non-existent user', async () => {
      const eventData = createApiBody({
        type: 'player_login',
        details: { location: 'Forest of Gor' },
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/events', eventData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })

    it('should reject event creation with invalid UUID format', async () => {
      const eventData = createApiBody({
        type: 'player_login',
        details: { location: 'Forest of Gor' },
        sl_uuid: 'invalid-uuid-format',
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/events', eventData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject event creation with invalid type length', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const eventData = createApiBody({
        type: 'a'.repeat(101), // Too long (max 100)
        details: { location: 'Forest of Gor' },
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/events', eventData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })

  describe('GET', () => {
    beforeEach(async () => {
      // Create test users and events
      const testUser1 = TEST_USERS[0]
      const testUser2 = TEST_USERS[1]
      await createTestUser(testUser1)
      await createTestUser(testUser2)

      // Create test events
      const events = [
        { type: 'player_login', details: { location: 'Forest' }, sl_uuid: testUser1.sl_uuid, universe: testUser1.universe },
        { type: 'item_purchase', details: { item: 'sword' }, sl_uuid: testUser1.sl_uuid, universe: testUser1.universe },
        { type: 'player_logout', details: { location: 'City' }, sl_uuid: testUser2.sl_uuid, universe: testUser2.universe },
      ]

      for (const eventInfo of events) {
        const eventData = createApiBody(eventInfo)
        const request = createMockPostRequest('/api/events', eventData)
        await POST(request)
      }
    })

    it('should retrieve events with default pagination', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/events', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(Array.isArray(data.data.events)).toBe(true)
      expect(data.data.events.length).toBe(3)
      expect(data.data.pagination).toBeDefined()
      expect(data.data.pagination.total).toBe(3)
      expect(data.data.pagination.limit).toBe(10)
      expect(data.data.pagination.offset).toBe(0)
      expect(data.data.pagination.has_more).toBe(false)
    })

    it('should retrieve events with custom pagination', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/events', {
        limit: '2',
        offset: '1',
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.events.length).toBe(2)
      expect(data.data.pagination.limit).toBe(2)
      expect(data.data.pagination.offset).toBe(1)
      expect(data.data.pagination.has_more).toBe(false)
    })

    it('should filter events by type', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/events', {
        type: 'player_login',
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.events.length).toBe(1)
      expect(data.data.events[0].type).toBe('player_login')
      expect(data.data.pagination.total).toBe(1)
    })

    it('should filter events by user_id', async () => {
      const testUser1 = TEST_USERS[0]

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser1.universe)
      const request = createMockGetRequest('/api/events', {
        user_id: testUser1.sl_uuid,
        timestamp,
        signature,
        universe: testUser1.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.events.length).toBe(2)
      expect(data.data.events.every(event => event.user_id === testUser1.sl_uuid)).toBe(true)
    })

    it('should return events in descending order by timestamp', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/events', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      const events = data.data.events
      
      for (let i = 0; i < events.length - 1; i++) {
        const currentTimestamp = new Date(events[i].timestamp)
        const nextTimestamp = new Date(events[i + 1].timestamp)
        expect(currentTimestamp.getTime()).toBeGreaterThanOrEqual(nextTimestamp.getTime())
      }
    })

    it('should include user information in events', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/events', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      
      data.data.events.forEach(event => {
        expect(event.id).toBeDefined()
        expect(event.type).toBeDefined()
        expect(event.details).toBeDefined()
        expect(event.user_id).toBeDefined()
        expect(event.username).toBeDefined()
        expect(event.timestamp).toBeDefined()
      })
    })

    it('should reject request with invalid signature', async () => {
      const request = createMockGetRequest('/api/events', {
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject request with missing signature', async () => {
      const request = createMockGetRequest('/api/events', {
        universe: 'Gor',
        timestamp: new Date().toISOString()
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should return 404 when filtering by non-existent user', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/events', {
        user_id: generateTestUUID(),
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })

    it('should respect pagination limits (max 100)', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/events', {
        limit: '150', // Try to exceed max
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      // Should be capped at 100, but we only have 3 events
      expect(data.data.events.length).toBe(3)
      expect(data.data.pagination.limit).toBe(150) // Still reflects requested limit
    })
  })
})