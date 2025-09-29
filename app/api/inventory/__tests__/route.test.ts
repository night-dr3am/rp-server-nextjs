import { GET } from '../route'
import {
  createMockGetRequest,
  cleanupDatabase,
  createTestUser,
  createTestUserWithInventory,
  TEST_USERS,
  TEST_ITEMS,
  expectSuccess,
  expectError,
  generateTestUUID,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { generateSignature } from '@/lib/signature'

describe('/api/inventory', () => {
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
    it('should retrieve user inventory successfully', async () => {
      const testUser = TEST_USERS[0]
      const testItems = TEST_ITEMS
      await createTestUserWithInventory(testUser, testItems)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: testUser.sl_uuid,
        timestamp,
        signature,
        universe: testUser.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()
      expect(data.data.sl_uuid).toBe(testUser.sl_uuid)
      expect(data.data.items).toBeDefined()
      expect(Array.isArray(data.data.items)).toBe(true)
      expect(data.data.items.length).toBe(testItems.length)

      // Verify item structure
      const item = data.data.items[0]
      expect(item).toHaveProperty('shortName')
      expect(item).toHaveProperty('name')
      expect(item).toHaveProperty('category')
      expect(item).toHaveProperty('quantity')
      expect(item).toHaveProperty('useCount')
      expect(item).toHaveProperty('values')
      expect(item).toHaveProperty('edible')
      expect(item).toHaveProperty('drinkable')
      expect(item).toHaveProperty('price')
    })

    it('should retrieve empty inventory for user with no items', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: testUser.sl_uuid,
        timestamp,
        signature,
        universe: testUser.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.items).toEqual([])
    })

    it('should filter inventory by category', async () => {
      const testUser = TEST_USERS[0]
      const testItems = [
        { ...TEST_ITEMS[0], category: 'Food' },
        { ...TEST_ITEMS[1], category: 'Drinks' },
      ]
      await createTestUserWithInventory(testUser, testItems)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: testUser.sl_uuid,
        category: 'Food',
        timestamp,
        signature,
        universe: testUser.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.items.length).toBe(1)
      expect(data.data.items[0].category).toBe('Food')
    })

    it('should return empty array for non-matching category filter', async () => {
      const testUser = TEST_USERS[0]
      const testItems = [TEST_ITEMS[0]]
      await createTestUserWithInventory(testUser, testItems)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: testUser.sl_uuid,
        category: 'NonExistentCategory',
        timestamp,
        signature,
        universe: testUser.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.items.length).toBe(0)
    })

    it('should sort items by shortName alphabetically', async () => {
      const testUser = TEST_USERS[0]
      const testItems = [
        { name: 'Zebra Item', shortName: 'ZEBRA', category: 'Test' },
        { name: 'Alpha Item', shortName: 'ALPHA', category: 'Test' },
        { name: 'Beta Item', shortName: 'BETA', category: 'Test' },
      ]
      await createTestUserWithInventory(testUser, testItems)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: testUser.sl_uuid,
        timestamp,
        signature,
        universe: testUser.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.items.length).toBe(3)
      expect(data.data.items[0].shortName).toBe('ALPHA')
      expect(data.data.items[1].shortName).toBe('BETA')
      expect(data.data.items[2].shortName).toBe('ZEBRA')
    })

    it('should reject request with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const request = createMockGetRequest('/api/inventory', {
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

    it('should reject request with missing sl_uuid', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/inventory', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Missing parameters')
      expect(response.status).toBe(400)
    })

    it('should reject request with missing signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        timestamp: new Date().toISOString()
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Missing parameters')
      expect(response.status).toBe(400)
    })

    it('should return 404 for non-existent user', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: generateTestUUID(),
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })

    it('should include item values and properties correctly', async () => {
      const testUser = TEST_USERS[0]
      const testItems = [{
        name: 'Test Food',
        shortName: 'FOOD',
        category: 'Food',
        hungerValue: 20,
        thirstValue: 5,
        healthValue: 10,
        edible: true,
        drinkable: false,
        priceGold: 1,
        priceSilver: 2,
        priceCopper: 3,
      }]
      await createTestUserWithInventory(testUser, testItems)

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUser.universe)
      const request = createMockGetRequest('/api/inventory', {
        sl_uuid: testUser.sl_uuid,
        timestamp,
        signature,
        universe: testUser.universe
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      const item = data.data.items[0]
      expect(item.values.hunger).toBe(20)
      expect(item.values.thirst).toBe(5)
      expect(item.values.health).toBe(10)
      expect(item.edible).toBe(true)
      expect(item.drinkable).toBe(false)
      expect(item.price.gold).toBe(1)
      expect(item.price.silver).toBe(2)
      expect(item.price.copper).toBe(3)
    })
  })
})