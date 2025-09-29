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

describe('/api/users/payment', () => {
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
    it('should process payment between users successfully', async () => {
      // Create sender and recipient
      const sender = TEST_USERS[0]
      const recipient = TEST_USERS[1]
      await createTestUser(sender)
      await createTestUser(recipient)

      const paymentData = createApiBody({
        sender_uuid: sender.sl_uuid,
        recipient_uuid: recipient.sl_uuid,
        goldCoin: 1,
        silverCoin: 5,
        copperCoin: 10,
        universe: sender.universe,
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.message).toBe('Payment processed successfully')
      expect(data.sender).toBeDefined()
      expect(data.recipient).toBeDefined()
      expect(data.amount).toBe('1g 5s 10c')
      
      // Verify balance changes
      expect(data.sender.stats.goldCoin).toBe(9) // 10 - 1
      expect(data.sender.stats.silverCoin).toBe(45) // 50 - 5
      expect(data.sender.stats.copperCoin).toBe(90) // 100 - 10
      
      expect(data.recipient.stats.goldCoin).toBe(11) // 10 + 1
      expect(data.recipient.stats.silverCoin).toBe(55) // 50 + 5
      expect(data.recipient.stats.copperCoin).toBe(110) // 100 + 10
    })

    it('should handle payment with only one currency type', async () => {
      const sender = TEST_USERS[0]
      const recipient = TEST_USERS[1]
      await createTestUser(sender)
      await createTestUser(recipient)

      const paymentData = createApiBody({
        sender_uuid: sender.sl_uuid,
        recipient_uuid: recipient.sl_uuid,
        goldCoin: 0,
        silverCoin: 0,
        copperCoin: 25,
        universe: sender.universe,
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.sender.stats.copperCoin).toBe(75) // 100 - 25
      expect(data.recipient.stats.copperCoin).toBe(125) // 100 + 25
      
      // Other currencies should remain unchanged
      expect(data.sender.stats.goldCoin).toBe(10)
      expect(data.sender.stats.silverCoin).toBe(50)
      expect(data.recipient.stats.goldCoin).toBe(10)
      expect(data.recipient.stats.silverCoin).toBe(50)
    })

    it('should reject payment with insufficient funds', async () => {
      await testExpectedError('Insufficient funds payment attempt', async () => {
        const sender = TEST_USERS[0]
        const recipient = TEST_USERS[1]
        await createTestUser(sender)
        await createTestUser(recipient)

        const paymentData = createApiBody({
          sender_uuid: sender.sl_uuid,
          recipient_uuid: recipient.sl_uuid,
          goldCoin: 15, // Sender only has 10 gold
          silverCoin: 0,
          copperCoin: 0,
          universe: sender.universe,
        })

        const request = createMockPostRequest('/api/users/payment', paymentData)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBeDefined()
        expect(data.error).toContain('Insufficient funds')
        expect(response.status).toBe(400)
      })
    })

    it('should reject payment when sender does not exist', async () => {
      const recipient = TEST_USERS[1]
      await createTestUser(recipient)

      const paymentData = createApiBody({
        sender_uuid: generateTestUUID(),
        recipient_uuid: recipient.sl_uuid,
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.error).toBeDefined()
      expect(data.error).toContain('Sender not found')
      expect(response.status).toBe(404)
    })

    it('should reject payment when recipient does not exist', async () => {
      const sender = TEST_USERS[0]
      await createTestUser(sender)

      const paymentData = createApiBody({
        sender_uuid: sender.sl_uuid,
        recipient_uuid: generateTestUUID(),
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
        universe: sender.universe,
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.error).toBeDefined()
      expect(data.error).toContain('Recipient not found')
      expect(response.status).toBe(404)
    })

    it('should reject payment with invalid signature', async () => {
      const sender = TEST_USERS[0]
      const recipient = TEST_USERS[1]
      await createTestUser(sender)
      await createTestUser(recipient)

      const paymentData = {
        sender_uuid: sender.sl_uuid,
        recipient_uuid: recipient.sl_uuid,
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
        universe: sender.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.error).toBeDefined()
      expect(data.error).toContain('Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject payment with missing required fields', async () => {
      const sender = TEST_USERS[0]
      await createTestUser(sender)

      const paymentData = createApiBody({
        sender_uuid: sender.sl_uuid,
        // missing recipient_uuid
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
        universe: sender.universe,
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.error).toBeDefined()
      expect(response.status).toBe(400)
    })

    it('should reject payment with negative amounts', async () => {
      const sender = TEST_USERS[0]
      const recipient = TEST_USERS[1]
      await createTestUser(sender)
      await createTestUser(recipient)

      const paymentData = createApiBody({
        sender_uuid: sender.sl_uuid,
        recipient_uuid: recipient.sl_uuid,
        goldCoin: -1, // Negative amount
        silverCoin: 0,
        copperCoin: 0,
        universe: sender.universe,
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.error).toBeDefined()
      expect(response.status).toBe(400)
    })

    it('should reject zero payment amounts', async () => {
      const sender = TEST_USERS[0]
      const recipient = TEST_USERS[1]
      await createTestUser(sender)
      await createTestUser(recipient)

      const paymentData = createApiBody({
        sender_uuid: sender.sl_uuid,
        recipient_uuid: recipient.sl_uuid,
        goldCoin: 0,
        silverCoin: 0,
        copperCoin: 0,
        universe: sender.universe,
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.error).toBeDefined()
      expect(data.error).toContain('Payment amount must be greater than zero')
      expect(response.status).toBe(400)
    })

    it('should handle payment with exact balance amount', async () => {
      const sender = TEST_USERS[0]
      const recipient = TEST_USERS[1]
      await createTestUser(sender)
      await createTestUser(recipient)

      // Pay all copper coins
      const paymentData = createApiBody({
        sender_uuid: sender.sl_uuid,
        recipient_uuid: recipient.sl_uuid,
        goldCoin: 0,
        silverCoin: 0,
        copperCoin: 100, // Exact amount sender has
        universe: sender.universe,
      })

      const request = createMockPostRequest('/api/users/payment', paymentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.sender.stats.copperCoin).toBe(0)
      expect(data.recipient.stats.copperCoin).toBe(200)
    })
  })
})