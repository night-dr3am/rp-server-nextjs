import { GET, POST } from '../route'
import {
  createMockGetRequest,
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'
import { generateSignature } from '@/lib/signature'

describe('/api/rpitems', () => {
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
    it('should create new RP item successfully', async () => {
      const itemData = createApiBody({
        name: 'Test Bread',
        shortName: 'TEST_BREAD',
        isShortNameDifferent: false,
        category: 'Food',
        tags: 'baked#grain',
        hungerValue: 20,
        thirstValue: 0,
        healthValue: 5,
        edible: true,
        drinkable: false,
        useCount: 0,
        priceGold: 0,
        priceSilver: 1,
        priceCopper: 50,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/rpitems', itemData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data.name).toBe('Test Bread')
      expect(data.data.shortName).toBe('TEST_BREAD')
      expect(data.data.category).toBe('Food')
      expect(data.data.hungerValue).toBe(20)
      expect(data.data.edible).toBe(true)
      expect(data.data.drinkable).toBe(false)

      // Verify item was created in database
      const dbItem = await prisma.rpItem.findUnique({
        where: {
          shortName_universe: {
            shortName: 'TEST_BREAD',
            universe: 'Gor'
          }
        }
      })
      expect(dbItem).toBeDefined()
      expect(dbItem!.name).toBe('Test Bread')
    })

    it('should update existing RP item successfully', async () => {
      // First create an item
      await prisma.rpItem.create({
        data: {
          name: 'Original Name',
          shortName: 'TEST_ITEM',
          isShortNameDifferent: false,
          category: 'Items',
          tags: 'original',
          hungerValue: 0,
          thirstValue: 0,
          healthValue: 0,
          edible: false,
          drinkable: false,
          useCount: 0,
          priceGold: 1,
          priceSilver: 0,
          priceCopper: 0,
          universe: 'Gor',
        }
      })

      // Now update it
      const updateData = createApiBody({
        name: 'Updated Name',
        shortName: 'TEST_ITEM', // Same shortName for upsert
        isShortNameDifferent: true,
        category: 'Food',
        tags: 'updated#modified',
        hungerValue: 15,
        thirstValue: 5,
        healthValue: 10,
        edible: true,
        drinkable: false,
        useCount: 3,
        priceGold: 0,
        priceSilver: 2,
        priceCopper: 25,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/rpitems', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.name).toBe('Updated Name')
      expect(data.data.category).toBe('Food')
      expect(data.data.hungerValue).toBe(15)
      expect(data.data.edible).toBe(true)

      // Verify update in database
      const dbItem = await prisma.rpItem.findUnique({
        where: {
          shortName_universe: {
            shortName: 'TEST_ITEM',
            universe: 'Gor'
          }
        }
      })
      expect(dbItem!.name).toBe('Updated Name')
      expect(dbItem!.category).toBe('Food')
    })

    it('should handle all valid categories', async () => {
      const categories = ['Food', 'Drinks', 'Minerals', 'Items', 'Poisons', 'Crops', 'Spices']

      for (const category of categories) {
        const itemData = createApiBody({
          name: `Test ${category}`,
          shortName: `TEST_${category.toUpperCase()}`,
          isShortNameDifferent: false,
          category,
          hungerValue: 0,
          thirstValue: 0,
          healthValue: 0,
          edible: false,
          drinkable: false,
          priceGold: 0,
          priceSilver: 1,
          priceCopper: 0,
          universe: 'Gor',
        })

        const request = createMockPostRequest('/api/rpitems', itemData)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.category).toBe(category)
      }
    })

    it('should reject item creation with invalid signature', async () => {
      const itemData = {
        name: 'Test Item',
        shortName: 'TEST',
        isShortNameDifferent: false,
        category: 'Food',
        hungerValue: 0,
        thirstValue: 0,
        healthValue: 0,
        edible: true,
        drinkable: false,
        priceGold: 0,
        priceSilver: 0,
        priceCopper: 1,
        universe: 'Gor',
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/rpitems', itemData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject item with missing required fields', async () => {
      const itemData = createApiBody({
        name: 'Test Item',
        universe: 'Gor',
        // missing shortName and other required fields
      })

      const request = createMockPostRequest('/api/rpitems', itemData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject item with invalid category', async () => {
      const itemData = createApiBody({
        name: 'Test Item',
        shortName: 'TEST',
        isShortNameDifferent: false,
        category: 'InvalidCategory',
        hungerValue: 0,
        thirstValue: 0,
        healthValue: 0,
        edible: false,
        drinkable: false,
        priceGold: 0,
        priceSilver: 0,
        priceCopper: 1,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/rpitems', itemData)

      await testExpectedError('Invalid category', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should handle negative stat values correctly', async () => {
      const itemData = createApiBody({
        name: 'Poison Item',
        shortName: 'POISON',
        isShortNameDifferent: false,
        category: 'Poisons',
        hungerValue: -50,
        thirstValue: -30,
        healthValue: -100,
        edible: true,
        drinkable: false,
        priceGold: 1,
        priceSilver: 0,
        priceCopper: 0,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/rpitems', itemData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.hungerValue).toBe(-50)
      expect(data.data.thirstValue).toBe(-30)
      expect(data.data.healthValue).toBe(-100)
    })
  })

  describe('GET', () => {
    beforeEach(async () => {
      // Create test items for GET tests
      await prisma.rpItem.createMany({
        data: [
          {
            name: 'Test Bread',
            shortName: 'BREAD',
            isShortNameDifferent: false,
            category: 'Food',
            tags: 'baked#grain',
            hungerValue: 20,
            thirstValue: 0,
            healthValue: 0,
            edible: true,
            drinkable: false,
            priceGold: 0,
            priceSilver: 1,
            priceCopper: 0,
            universe: 'Gor',
          },
          {
            name: 'Test Water',
            shortName: 'WATER',
            isShortNameDifferent: false,
            category: 'Drinks',
            tags: 'liquid#clean',
            hungerValue: 0,
            thirstValue: 30,
            healthValue: 0,
            edible: false,
            drinkable: true,
            priceGold: 0,
            priceSilver: 0,
            priceCopper: 50,
            universe: 'Gor',
          },
          {
            name: 'Iron Ore',
            shortName: 'IRON',
            isShortNameDifferent: false,
            category: 'Minerals',
            tags: 'metal#valuable',
            hungerValue: 0,
            thirstValue: 0,
            healthValue: 0,
            edible: false,
            drinkable: false,
            priceGold: 2,
            priceSilver: 0,
            priceCopper: 0,
            universe: 'Gor',
          }
        ]
      })
    })

    it('should retrieve all items successfully', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data).toHaveLength(3)
      
      // Should be sorted alphabetically by shortName
      expect(data.data[0].shortName).toBe('BREAD')
      expect(data.data[1].shortName).toBe('IRON')
      expect(data.data[2].shortName).toBe('WATER')
    })

    it('should retrieve items by category', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        category: 'Food',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(1)
      expect(data.data[0].shortName).toBe('BREAD')
      expect(data.data[0].category).toBe('Food')
    })

    it('should retrieve specific item by shortName', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        shortName: 'WATER',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(1)
      expect(data.data[0].shortName).toBe('WATER')
      expect(data.data[0].name).toBe('Test Water')
    })

    it('should filter items by tags', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        tags: 'liquid',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(1)
      expect(data.data[0].shortName).toBe('WATER')
    })

    it('should handle multiple tag search', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        tags: 'metal#grain',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(2) // Should find both IRON (metal) and BREAD (grain)
    })

    it('should limit results with count parameter', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        count: '2',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(2)
    })

    it('should return random items when random=1', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        random: '1',
        count: '2',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(2)
      // Items should be present but order may vary due to randomization
    })

    it('should reject request with invalid signature', async () => {
      const request = createMockGetRequest('/api/rpitems', {
        universe: 'Gor',
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      })

      await testExpectedError('Invalid signature', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should return 404 for non-existent item shortName', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        shortName: 'NON_EXISTENT',
        universe: 'Gor',
        timestamp,
        signature
      })

      await testExpectedError('Item not found', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Item not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject invalid count parameter', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        count: 'invalid',
        universe: 'Gor',
        timestamp,
        signature
      })

      await testExpectedError('Invalid count parameter', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'count must be a positive number')
        expect(response.status).toBe(400)
      })
    })

    it('should reject negative count parameter', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        count: '-1',
        universe: 'Gor',
        timestamp,
        signature
      })

      await testExpectedError('Negative count parameter', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'count must be a positive number')
        expect(response.status).toBe(400)
      })
    })

    it('should handle empty results gracefully', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        category: 'NonExistentCategory',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(0)
    })

    it('should handle complex filtering combinations', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/rpitems', {
        category: 'Food',
        tags: 'grain',
        count: '1',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(1)
      expect(data.data[0].shortName).toBe('BREAD')
      expect(data.data[0].category).toBe('Food')
    })
  })
})