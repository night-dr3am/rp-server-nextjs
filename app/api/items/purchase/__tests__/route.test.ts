import { POST } from '../route'
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  createTestUser,
  TEST_USERS,
  expectError,
  generateTestUUID,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'

describe('/api/items/purchase', () => {
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
    it('should process item purchase successfully', async () => {
      const buyer = TEST_USERS[0]
      const seller = TEST_USERS[1]
      
      await createTestUser(buyer)
      await createTestUser(seller)

      const purchaseData = createApiBody({
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: seller.sl_uuid,
        universe: buyer.universe,
        itemName: 'Magic Sword',
        goldCoin: 5,
        silverCoin: 10,
        copperCoin: 25,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.buyerName).toBe(buyer.username)
      expect(data.sellerName).toBe(seller.username)
      expect(data.itemName).toBe('Magic Sword')
      expect(data.amount).toBe('5g 10s 25c')
      expect(data.eventId).toBeDefined()
      expect(data.timestamp).toBeDefined()

      // Verify buyer currency deducted
      const buyerUser = await prisma.user.findFirst({
        where: { slUuid: buyer.sl_uuid, universe: buyer.universe }, 
        include: { stats: true } 
      })
      expect(buyerUser!.stats!.goldCoin).toBe(5) // 10 - 5
      expect(buyerUser!.stats!.silverCoin).toBe(40) // 50 - 10
      expect(buyerUser!.stats!.copperCoin).toBe(75) // 100 - 25

      // Verify seller currency increased
      const sellerUser = await prisma.user.findFirst({
        where: { slUuid: seller.sl_uuid, universe: seller.universe }, 
        include: { stats: true } 
      })
      expect(sellerUser!.stats!.goldCoin).toBe(15) // 10 + 5
      expect(sellerUser!.stats!.silverCoin).toBe(60) // 50 + 10
      expect(sellerUser!.stats!.copperCoin).toBe(125) // 100 + 25
    })

    it('should create purchase event', async () => {
      const buyer = TEST_USERS[0]
      const seller = TEST_USERS[1]
      
      await createTestUser(buyer)
      await createTestUser(seller)

      const purchaseData = createApiBody({
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: seller.sl_uuid,
        universe: buyer.universe,
        itemName: 'Health Potion',
        goldCoin: 0,
        silverCoin: 5,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)

      // Verify event was created
      const buyerUser = await prisma.user.findFirst({ where: { slUuid: buyer.sl_uuid, universe: buyer.universe } })
      const event = await prisma.event.findFirst({
        where: {
          type: 'item_purchase',
          userId: buyerUser!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(event).toBeDefined()
      expect(event!.details).toMatchObject({
        item: 'Health Potion',
        buyer: buyer.username,
        seller: seller.username,
        amount: '0g 5s 0c'
      })
    })

    it('should reject purchase when buyer has insufficient gold', async () => {
      const buyer = TEST_USERS[0]
      const seller = TEST_USERS[1]
      
      await createTestUser(buyer)
      await createTestUser(seller)

      const purchaseData = createApiBody({
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: seller.sl_uuid,
        universe: buyer.universe,
        itemName: 'Expensive Item',
        goldCoin: 20, // Buyer only has 10 gold
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Insufficient gold funds', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Insufficient funds')
        expect(response.status).toBe(400)
      })
    })

    it('should reject purchase when buyer has insufficient silver', async () => {
      const buyer = TEST_USERS[0]
      const seller = TEST_USERS[1]
      
      await createTestUser(buyer)
      await createTestUser(seller)

      const purchaseData = createApiBody({
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: seller.sl_uuid,
        universe: buyer.universe,
        itemName: 'Silver Item',
        goldCoin: 0,
        silverCoin: 100, // Buyer only has 50 silver
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Insufficient silver funds', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Insufficient funds')
        expect(response.status).toBe(400)
      })
    })

    it('should reject purchase when buyer has insufficient copper', async () => {
      const buyer = TEST_USERS[0]
      const seller = TEST_USERS[1]
      
      await createTestUser(buyer)
      await createTestUser(seller)

      const purchaseData = createApiBody({
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: seller.sl_uuid,
        universe: buyer.universe,
        itemName: 'Copper Item',
        goldCoin: 0,
        silverCoin: 0,
        copperCoin: 200, // Buyer only has 100 copper
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Insufficient copper funds', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Insufficient funds')
        expect(response.status).toBe(400)
      })
    })

    it('should reject purchase with invalid signature', async () => {
      const buyer = TEST_USERS[0]
      const seller = TEST_USERS[1]

      const purchaseData = {
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: seller.sl_uuid,
        universe: buyer.universe,
        itemName: 'Test Item',
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject purchase when buyer does not exist', async () => {
      const seller = TEST_USERS[1]
      await createTestUser(seller)

      const purchaseData = createApiBody({
        buyer_uuid: generateTestUUID(),
        seller_uuid: seller.sl_uuid,
        universe: seller.universe,
        itemName: 'Test Item',
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Buyer not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Buyer or seller not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject purchase when seller does not exist', async () => {
      const buyer = TEST_USERS[0]
      await createTestUser(buyer)

      const purchaseData = createApiBody({
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: generateTestUUID(),
        universe: buyer.universe,
        itemName: 'Test Item',
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Seller not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Buyer or seller not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject purchase with missing required fields', async () => {
      const purchaseData = createApiBody({
        buyer_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        // missing seller_uuid, itemName, and coin amounts
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject purchase with zero total price', async () => {
      const purchaseData = createApiBody({
        buyer_uuid: TEST_USERS[0].sl_uuid,
        seller_uuid: TEST_USERS[1].sl_uuid,
        universe: TEST_USERS[0].universe,
        itemName: 'Free Item',
        goldCoin: 0,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Zero price validation', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject purchase when buyer and seller are the same', async () => {
      const purchaseData = createApiBody({
        buyer_uuid: TEST_USERS[0].sl_uuid,
        seller_uuid: TEST_USERS[0].sl_uuid, // Same user
        universe: TEST_USERS[0].universe,
        itemName: 'Self Purchase Item',
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Self-purchase validation', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject purchase with negative coin amounts', async () => {
      const purchaseData = createApiBody({
        buyer_uuid: TEST_USERS[0].sl_uuid,
        seller_uuid: TEST_USERS[1].sl_uuid,
        universe: TEST_USERS[0].universe,
        itemName: 'Negative Price Item',
        goldCoin: -1,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)

      await testExpectedError('Negative price validation', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should handle mixed currency purchase correctly', async () => {
      const buyer = TEST_USERS[0]
      const seller = TEST_USERS[1]
      
      await createTestUser(buyer)
      await createTestUser(seller)

      const purchaseData = createApiBody({
        buyer_uuid: buyer.sl_uuid,
        seller_uuid: seller.sl_uuid,
        universe: buyer.universe,
        itemName: 'Mixed Currency Item',
        goldCoin: 3,
        silverCoin: 15,
        copperCoin: 50,
      })

      const request = createMockPostRequest('/api/items/purchase', purchaseData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.amount).toBe('3g 15s 50c')

      // Verify exact currency calculations
      const buyerUser = await prisma.user.findFirst({
        where: { slUuid: buyer.sl_uuid, universe: buyer.universe }, 
        include: { stats: true } 
      })
      expect(buyerUser!.stats!.goldCoin).toBe(7) // 10 - 3
      expect(buyerUser!.stats!.silverCoin).toBe(35) // 50 - 15
      expect(buyerUser!.stats!.copperCoin).toBe(50) // 100 - 50

      const sellerUser = await prisma.user.findFirst({
        where: { slUuid: seller.sl_uuid, universe: seller.universe }, 
        include: { stats: true } 
      })
      expect(sellerUser!.stats!.goldCoin).toBe(13) // 10 + 3
      expect(sellerUser!.stats!.silverCoin).toBe(65) // 50 + 15
      expect(sellerUser!.stats!.copperCoin).toBe(150) // 100 + 50
    })
  })
})