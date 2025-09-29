import { POST } from '../route'
import {
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
import { prisma } from '@/lib/prisma'

describe('/api/users/payout', () => {
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
    it('should process job payout successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const payoutData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        copperCoin: 25,
        jobName: 'Mining',
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data.sl_uuid).toBe(testUser.sl_uuid)
      expect(data.data.jobName).toBe('Mining')
      expect(data.data.added.copper).toBe(25)
      expect(data.data.balance.copper).toBe(125) // 100 + 25

      // Verify database state
      const user = await prisma.user.findFirst({
        where: { slUuid: testUser.sl_uuid, universe: testUser.universe },
        include: { stats: true }
      })
      expect(user!.stats!.copperCoin).toBe(125)
    })

    it('should create job payout event', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const payoutData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        copperCoin: 15,
        jobName: 'Fishing',
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)

      // Verify event was created
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      const event = await prisma.event.findFirst({
        where: {
          type: 'JOB_PAYOUT',
          userId: user!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(event).toBeDefined()
      expect(event!.details).toMatchObject({
        jobName: 'Fishing',
        amount: { copper: 15 }
      })
    })

    it('should handle large payout amounts', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const payoutData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        copperCoin: 500,
        jobName: 'Special Quest',
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.added.copper).toBe(500)
      expect(data.data.balance.copper).toBe(600) // 100 + 500
    })

    it('should reject payout with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const payoutData = {
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        copperCoin: 25,
        jobName: 'Mining',
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/users/payout', payoutData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject payout for non-existent user', async () => {
      const payoutData = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'Gor',
        copperCoin: 25,
        jobName: 'Mining',
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)

      await testExpectedError('User not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'User not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject payout with missing required fields', async () => {
      const payoutData = createApiBody({
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        // missing copperCoin and jobName
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject payout with zero copper amount', async () => {
      const payoutData = createApiBody({
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        copperCoin: 0,
        jobName: 'Zero Job',
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)

      await testExpectedError('Zero payout amount', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject payout with negative copper amount', async () => {
      const payoutData = createApiBody({
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        copperCoin: -10,
        jobName: 'Negative Job',
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)

      await testExpectedError('Negative payout amount', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject payout with empty job name', async () => {
      const payoutData = createApiBody({
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        copperCoin: 25,
        jobName: '',
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)

      await testExpectedError('Empty job name', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject payout with excessively long job name', async () => {
      const longJobName = 'A'.repeat(101) // 101 characters, exceeds 100 char limit

      const payoutData = createApiBody({
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        copperCoin: 25,
        jobName: longJobName,
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)

      await testExpectedError('Job name too long', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should handle valid job names at boundary lengths', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // Test maximum allowed length (100 characters)
      const maxJobName = 'A'.repeat(100)

      const payoutData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        copperCoin: 25,
        jobName: maxJobName,
      })

      const request = createMockPostRequest('/api/users/payout', payoutData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.jobName).toBe(maxJobName)
    })

    it('should process multiple payouts for same user', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      // First payout
      const payout1 = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        copperCoin: 20,
        jobName: 'Mining Session 1',
      })

      const request1 = createMockPostRequest('/api/users/payout', payout1)
      const response1 = await POST(request1)
      const data1 = await parseJsonResponse(response1)

      expectSuccess(data1)
      expect(data1.data.balance.copper).toBe(120) // 100 + 20

      // Second payout
      const payout2 = createApiBody({
        sl_uuid: testUser.sl_uuid,
        universe: testUser.universe,
        copperCoin: 30,
        jobName: 'Mining Session 2',
      })

      const request2 = createMockPostRequest('/api/users/payout', payout2)
      const response2 = await POST(request2)
      const data2 = await parseJsonResponse(response2)

      expectSuccess(data2)
      expect(data2.data.balance.copper).toBe(150) // 120 + 30

      // Verify final database state
      const user = await prisma.user.findFirst({
        where: { slUuid: testUser.sl_uuid, universe: testUser.universe },
        include: { stats: true }
      })
      expect(user!.stats!.copperCoin).toBe(150)

      // Verify both events were created
      const events = await prisma.event.findMany({
        where: {
          type: 'JOB_PAYOUT',
          userId: user!.id,
        },
        orderBy: { timestamp: 'asc' }
      })

      expect(events).toHaveLength(2)
      expect(events[0].details).toMatchObject({ jobName: 'Mining Session 1' })
      expect(events[1].details).toMatchObject({ jobName: 'Mining Session 2' })
    })
  })
})