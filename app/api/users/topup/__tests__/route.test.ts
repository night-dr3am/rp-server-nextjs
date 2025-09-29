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

describe('/api/users/topup', () => {
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
    it('should topup user currency successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: 5,
        silverCoin: 10,
        copperCoin: 25,
        details: 'Test topup',
      })

      const request = createMockPostRequest('/api/users/topup', topupData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.message).toBe('Topup successful')
      expect(data.username).toBe(testUser.username)
      expect(data.amount).toBe('5g 10s 25c')
      expect(data.goldCoin).toBe(5)
      expect(data.silverCoin).toBe(10)
      expect(data.copperCoin).toBe(25)
      expect(data.eventId).toBeDefined()

      // Verify currency balance increased
      expect(data.newBalance.goldCoin).toBe(15) // 10 + 5
      expect(data.newBalance.silverCoin).toBe(60) // 50 + 10
      expect(data.newBalance.copperCoin).toBe(125) // 100 + 25

      // Verify database state
      const user = await prisma.user.findFirst({
        where: { slUuid: testUser.sl_uuid, universe: testUser.universe },
        include: { stats: true }
      })
      expect(user!.stats!.goldCoin).toBe(15)
      expect(user!.stats!.silverCoin).toBe(60)
      expect(user!.stats!.copperCoin).toBe(125)
    })

    it('should topup with only gold coins', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: 3,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/users/topup', topupData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.amount).toBe('3g 0s 0c')
      expect(data.newBalance.goldCoin).toBe(13) // 10 + 3
      expect(data.newBalance.silverCoin).toBe(50) // unchanged
      expect(data.newBalance.copperCoin).toBe(100) // unchanged
    })

    it('should create topup event', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: 0,
        silverCoin: 5,
        copperCoin: 0,
        details: 'Admin bonus',
      })

      const request = createMockPostRequest('/api/users/topup', topupData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)

      // Verify event was created
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      const event = await prisma.event.findFirst({
        where: {
          type: 'TOPUP',
          userId: user!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(event).toBeDefined()
      expect(event!.details).toMatchObject({
        goldCoin: 0,
        silverCoin: 5,
        copperCoin: 0,
        description: 'Admin bonus'
      })
    })

    it('should reject topup with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/users/topup', topupData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject topup for non-existent user', async () => {
      const topupData = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/users/topup', topupData)

      await testExpectedError('User not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('User not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject topup with missing sl_uuid', async () => {
      const topupData = createApiBody({
        // missing sl_uuid
        goldCoin: 1,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/users/topup', topupData)

      await testExpectedError('Missing sl_uuid or universe', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('"sl_uuid" is required')
        expect(response.status).toBe(400)
      })
    })

    it('should reject topup with negative coin amounts', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: -1,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/users/topup', topupData)

      await testExpectedError('Negative coin amounts', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('"goldCoin" must be greater than or equal to 0')
        expect(response.status).toBe(400)
      })
    })

    it('should reject topup with all zero coin amounts', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: 0,
        silverCoin: 0,
        copperCoin: 0,
      })

      const request = createMockPostRequest('/api/users/topup', topupData)

      await testExpectedError('Zero topup amount', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('At least one coin amount must be greater than 0')
        expect(response.status).toBe(400)
      })
    })

    it('should handle string coin amounts by parsing to integers', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: '2',
        silverCoin: '15',
        copperCoin: '30',
      })

      const request = createMockPostRequest('/api/users/topup', topupData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.goldCoin).toBe(2)
      expect(data.silverCoin).toBe(15)
      expect(data.copperCoin).toBe(30)
      expect(data.newBalance.goldCoin).toBe(12) // 10 + 2
      expect(data.newBalance.silverCoin).toBe(65) // 50 + 15
      expect(data.newBalance.copperCoin).toBe(130) // 100 + 30
    })

    it('should use default description when none provided', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const topupData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        goldCoin: 1,
        silverCoin: 2,
        copperCoin: 3,
      })

      const request = createMockPostRequest('/api/users/topup', topupData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)

      // Check event has default description
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      const event = await prisma.event.findFirst({
        where: { type: 'TOPUP', userId: user!.id },
        orderBy: { timestamp: 'desc' }
      })

      expect(event!.details).toMatchObject({
        description: 'System topup: 1g 2s 3c'
      })
    })
  })
})