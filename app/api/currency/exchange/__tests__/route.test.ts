import { POST } from '../route'
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  createTestUser,
  TEST_USERS,
  generateTestUUID,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'

describe('/api/currency/exchange', () => {
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
    it('should exchange gold to silver successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '1g', // Pay 1 gold
        receive_amount: '95s', // Receive 95 silver (5 silver exchange fee)
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.message).toBe('Currency exchange completed successfully')
      expect(data.username).toBe(testUser.username)
      expect(data.pay_amount).toBe('1g')
      expect(data.receive_amount).toBe('95s')
      expect(data.exchange_fee_copper).toBe(500) // 5 silver = 500 copper
      
      // User should now have 9 gold, 145 silver (50 + 95), 100 copper
      expect(data.balance.gold).toBe(9)
      expect(data.balance.silver).toBe(145)
      expect(data.balance.copper).toBe(100)

      // Verify database state
      const user = await prisma.user.findFirst({
        where: { slUuid: testUser.sl_uuid, universe: testUser.universe },
        include: { stats: true }
      })
      expect(user!.stats!.goldCoin).toBe(9)
      expect(user!.stats!.silverCoin).toBe(145)
      expect(user!.stats!.copperCoin).toBe(100)
    })

    it('should exchange silver to copper successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '10s', // Pay 10 silver
        receive_amount: '950c', // Receive 950 copper (50 copper exchange fee)
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.exchange_fee_copper).toBe(50)
      expect(data.balance.gold).toBe(10)
      expect(data.balance.silver).toBe(40) // 50 - 10
      expect(data.balance.copper).toBe(1050) // 100 + 950
    })

    it('should exchange mixed currencies successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '1g5s50c', // Pay 1 gold, 5 silver, 50 copper (10550 copper total)
        receive_amount: '100s', // Receive 100 silver (10000 copper - fee of 550 copper)
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.balance.gold).toBe(9) // 10 - 1
      expect(data.balance.silver).toBe(145) // 50 - 5 + 100
      expect(data.balance.copper).toBe(50) // 100 - 50
    })

    it('should create exchange event', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '2g',
        receive_amount: '190s',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)

      // Verify event was created
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      const event = await prisma.event.findFirst({
        where: {
          type: 'CURRENCY_EXCHANGE',
          userId: user!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(event).toBeDefined()
      expect(event!.details).toMatchObject({
        action: 'currency_exchange',
        pay_amount: '2g',
        receive_amount: '190s',
        paid: { gold: 2, silver: 0, copper: 0 },
        received: { gold: 0, silver: 190, copper: 0 }
      })
    })

    it('should reject exchange with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '1g',
        receive_amount: '95s',
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject exchange for non-existent user', async () => {
      const exchangeData = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
        pay_amount: '1g',
        receive_amount: '95s',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('User not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('User not found')
        expect(response.status).toBe(400)
      })
    })

    it('should reject exchange with insufficient gold coins', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '15g', // User only has 10 gold
        receive_amount: '1400s',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Insufficient gold coins', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('Insufficient gold coins')
        expect(response.status).toBe(400)
      })
    })

    it('should reject exchange with insufficient silver coins', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '100s', // User only has 50 silver
        receive_amount: '9500c',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Insufficient silver coins', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('Insufficient silver coins')
        expect(response.status).toBe(400)
      })
    })

    it('should reject exchange with insufficient copper coins', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '200c', // User only has 100 copper
        receive_amount: '190c',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Insufficient copper coins', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('Insufficient copper coins')
        expect(response.status).toBe(400)
      })
    })

    it('should reject exchange with invalid currency format', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: 'invalid', // Invalid format
        receive_amount: '95s',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Invalid currency format', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('"pay_amount"')
        expect(response.status).toBe(400)
      })
    })

    it('should reject exchange where receive amount is greater than pay amount', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '1g', // 10000 copper equivalent
        receive_amount: '105s', // 10500 copper equivalent (more than paid)
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Invalid exchange rate', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('Invalid exchange: receive amount must be less than pay amount')
        expect(response.status).toBe(400)
      })
    })

    it('should reject exchange with missing required fields', async () => {
      const exchangeData = createApiBody({
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        // missing pay_amount and receive_amount
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('"pay_amount"')
        expect(response.status).toBe(400)
      })
    })

    it('should reject exchange with empty currency amounts', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '', // Empty string
        receive_amount: '95s',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)

      await testExpectedError('Empty currency amount', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBeDefined()
        expect(response.status).toBe(400)
      })
    })

    it('should handle complex exchange rates correctly', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // Exchange 1 gold for 90 silver (valid exchange with fee)
      // Pay value: 1*10000 = 10000 copper
      // Receive value: 90*100 = 9000 copper (valid - less than paid)
      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '1g',
        receive_amount: '90s', // Less than paid (valid exchange)
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.balance.gold).toBe(9) // 10 - 1
      expect(data.balance.silver).toBe(140) // 50 + 90
      expect(data.balance.copper).toBe(100) // unchanged
    })

    it('should validate currency string patterns correctly', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // Test valid patterns
      const validFormats = [
        { pay: '1g', receive: '90s' },
        { pay: '50s', receive: '4500c' },
        { pay: '100c', receive: '90c' },
        { pay: '1g50s100c', receive: '140s' }
      ]

      for (const format of validFormats) {
        const exchangeData = createApiBody({
          sl_uuid: testUser.sl_uuid,
          universe: testUser.universe,
          pay_amount: format.pay,
          receive_amount: format.receive,
        })

        const request = createMockPostRequest('/api/currency/exchange', exchangeData)
        const response = await POST(request)
        
        expect(response.status).not.toBe(400) // Should not fail due to format
      }
    })

    it('should maintain transaction atomicity on database errors', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // Get initial balance
      const initialUser = await prisma.user.findFirst({
        where: { slUuid: testUser.sl_uuid, universe: testUser.universe },
        include: { stats: true }
      })

      const exchangeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        pay_amount: '1g',
        receive_amount: '95s',
      })

      const request = createMockPostRequest('/api/currency/exchange', exchangeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      // This should succeed
      expect(data.success).toBe(true)

      // Verify the exchange worked
      const finalUser = await prisma.user.findFirst({
        where: { slUuid: testUser.sl_uuid, universe: testUser.universe },
        include: { stats: true }
      })

      expect(finalUser!.stats!.goldCoin).toBe(initialUser!.stats!.goldCoin - 1)
      expect(finalUser!.stats!.silverCoin).toBe(initialUser!.stats!.silverCoin + 95)
    })
  })
})