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

describe('/api/estate/rent', () => {
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
    beforeEach(async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      // Create test estates
      await prisma.estate.createMany({
        data: [
          {
            estateId: 'RENT_ESTATE_001',
            name: 'Rental Estate',
            description: 'Available for rent',
            rentPricePerDay: 100, // 100 copper per day
            location: 'Rental Location',
            totalPaidAmount: 0,
            universe: testUniverse,
          },
          {
            estateId: 'EXPENSIVE_ESTATE',
            name: 'Expensive Estate',
            description: 'Very expensive estate',
            rentPricePerDay: 1000, // 1000 copper per day
            location: 'Premium Location',
            totalPaidAmount: 0,
            universe: testUniverse,
          }
        ]
      })
    })

    it('should rent estate successfully', async () => {
      const testUser = TEST_USERS[0] // Has 100 copper by default
      await createTestUser(testUser)

      // Give user enough funds (500 copper for 3 days at 100/day = 300 needed)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      await prisma.userStats.update({
        where: { userId: user!.id },
        data: { copperCoin: 500 }
      })

      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 3,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.data.estateId).toBe('RENT_ESTATE_001')
      expect(data.data.estateName).toBe('Rental Estate')
      expect(data.data.renterUuid).toBe(testUser.sl_uuid)
      expect(data.data.renterName).toBe(testUser.username)
      expect(data.data.daysRemaining).toBe(3)
      expect(data.data.daysAdded).toBe(3)
      expect(data.data.totalCost).toBe(300)
      expect(data.data.totalPaidAmount).toBe(300)
      expect(data.data.isExtension).toBe(false)
      expect(data.data.pricePerDay).toBe(100)
      expect(data.data.rentStartDate).toBeDefined()
      expect(data.data.rentEndDate).toBeDefined()

      // Verify estate is updated in database
      const updatedEstate = await prisma.estate.findUnique({
        where: {
          estateId_universe: {
            estateId: 'RENT_ESTATE_001',
            universe: testUser.universe
          }
        },
        include: { rentingUser: true }
      })
      expect(updatedEstate!.rentingUserId).toBe(user!.id)
      expect(updatedEstate!.totalPaidAmount).toBe(300)

      // Verify user's funds were deducted
      const updatedUserStats = await prisma.userStats.findUnique({
        where: { userId: user!.id }
      })
      expect(updatedUserStats!.copperCoin).toBe(200) // 500 - 300
    })

    it('should extend existing rental successfully', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      // Give user enough funds
      await prisma.userStats.update({
        where: { userId: user!.id },
        data: { copperCoin: 1000 }
      })

      // Create existing rental
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 2) // 2 days from now

      await prisma.estate.update({
        where: {
          estateId_universe: {
            estateId: 'RENT_ESTATE_001',
            universe: testUser.universe
          }
        },
        data: {
          rentingUserId: user!.id,
          rentStartDate: new Date(),
          rentEndDate: futureDate,
          totalPaidAmount: 200,
        }
      })

      // Extend the rental by 3 more days
      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 3,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.isExtension).toBe(true)
      expect(data.data.daysAdded).toBe(3)
      expect(data.data.totalCost).toBe(300)
      expect(data.data.totalPaidAmount).toBe(500) // 200 + 300

      // Verify the rental was extended, not reset
      const updatedEstate = await prisma.estate.findUnique({
        where: {
          estateId_universe: {
            estateId: 'RENT_ESTATE_001',
            universe: testUser.universe
          }
        }
      })
      expect(updatedEstate!.totalPaidAmount).toBe(500)
    })

    it('should create rental event', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      await prisma.userStats.update({
        where: { userId: user!.id },
        data: { copperCoin: 500 }
      })

      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 2,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)

      // Verify event was created
      const event = await prisma.event.findFirst({
        where: {
          type: 'ESTATE_RENTAL_STARTED',
          userId: user!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(event).toBeDefined()
      expect(event!.details).toMatchObject({
        estateId: 'RENT_ESTATE_001',
        estateName: 'Rental Estate',
        days: 2,
        totalCost: 200,
        pricePerDay: 100,
        isExtension: false
      })
    })

    it('should reject rental with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const rentData = {
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 1,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/estate/rent', rentData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject rental for non-existent estate', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const rentData = createApiBody({
        estateId: 'NON_EXISTENT_ESTATE',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 1,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)

      await testExpectedError('Estate not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Estate not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject rental for non-existent user', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: generateTestUUID(),
        universe: testUniverse,
        days: 1,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)

      await testExpectedError('Renter not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Renter not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject rental with insufficient funds', async () => {
      const testUser = TEST_USERS[0] // Has 100 copper by default
      await createTestUser(testUser)

      // Try to rent expensive estate for 2 days (2000 copper needed, user has 100)
      const rentData = createApiBody({
        estateId: 'EXPENSIVE_ESTATE',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 2,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)

      await testExpectedError('Insufficient funds', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toContain('Insufficient funds')
        expect(response.status).toBe(400)
      })
    })

    it('should reject rental when estate is already rented by another user', async () => {
      const testUser1 = TEST_USERS[0]
      const testUser2 = TEST_USERS[1]
      
      await createTestUser(testUser1)
      await createTestUser(testUser2)
      
      const user1 = await prisma.user.findFirst({ where: { slUuid: testUser1.sl_uuid, universe: testUser1.universe } })
      const user2 = await prisma.user.findFirst({ where: { slUuid: testUser2.sl_uuid, universe: testUser2.universe } })

      // Give both users funds
      await prisma.userStats.update({
        where: { userId: user1!.id },
        data: { copperCoin: 500 }
      })
      await prisma.userStats.update({
        where: { userId: user2!.id },
        data: { copperCoin: 500 }
      })

      // User1 rents the estate
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 5)

      await prisma.estate.update({
        where: {
          estateId_universe: {
            estateId: 'RENT_ESTATE_001',
            universe: testUser1.universe
          }
        },
        data: {
          rentingUserId: user1!.id,
          rentStartDate: new Date(),
          rentEndDate: futureDate,
          totalPaidAmount: 500,
        }
      })

      // User2 tries to rent the same estate
      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser2.sl_uuid,
        universe: testUser2.universe,
        days: 2,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)

      await testExpectedError('Estate already rented', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Estate is already rented by another user')
        expect(response.status).toBe(400)
      })
    })

    it('should reject rental with missing required fields', async () => {
      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        // missing days
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid rental data')
        expect(response.status).toBe(400)
      })
    })

    it('should reject rental with zero or negative days', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 0,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)

      await testExpectedError('Invalid days value', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid rental data')
        expect(response.status).toBe(400)
      })
    })

    it('should handle rental of expired estate by same user', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      // Give user funds
      await prisma.userStats.update({
        where: { userId: user!.id },
        data: { copperCoin: 500 }
      })

      // Create expired rental for same user
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1) // Yesterday

      await prisma.estate.update({
        where: {
          estateId_universe: {
            estateId: 'RENT_ESTATE_001',
            universe: testUser.universe
          }
        },
        data: {
          rentingUserId: user!.id,
          rentStartDate: new Date(pastDate.getTime() - (3 * 24 * 60 * 60 * 1000)),
          rentEndDate: pastDate, // Expired yesterday
          totalPaidAmount: 300,
        }
      })

      // User should be able to rent again (new rental, not extension)
      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 2,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.isExtension).toBe(false) // Should be new rental, not extension
      expect(data.data.totalPaidAmount).toBe(200) // New rental cost only
    })

    it('should calculate days remaining correctly', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      await prisma.userStats.update({
        where: { userId: user!.id },
        data: { copperCoin: 500 }
      })

      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 5,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.daysRemaining).toBe(5)

      // Verify the end date is approximately 5 days from now
      const rentEndDate = new Date(data.data.rentEndDate)
      const now = new Date()
      const expectedEndDate = new Date(now.getTime() + (5 * 24 * 60 * 60 * 1000))
      
      // Allow for some variance due to execution time
      const timeDiff = Math.abs(rentEndDate.getTime() - expectedEndDate.getTime())
      expect(timeDiff).toBeLessThan(5000) // Less than 5 seconds difference
    })

    it('should create extension event for rental extensions', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      await prisma.userStats.update({
        where: { userId: user!.id },
        data: { copperCoin: 1000 }
      })

      // Create existing rental
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 3)

      await prisma.estate.update({
        where: {
          estateId_universe: {
            estateId: 'RENT_ESTATE_001',
            universe: testUser.universe
          }
        },
        data: {
          rentingUserId: user!.id,
          rentStartDate: new Date(),
          rentEndDate: futureDate,
          totalPaidAmount: 300,
        }
      })

      // Extend rental
      const rentData = createApiBody({
        estateId: 'RENT_ESTATE_001',
        renterUuid: testUser.sl_uuid,
        universe: testUser.universe,
        days: 2,
      })

      const request = createMockPostRequest('/api/estate/rent', rentData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.isExtension).toBe(true)

      // Verify extension event was created
      const event = await prisma.event.findFirst({
        where: {
          type: 'ESTATE_RENTAL_EXTENDED',
          userId: user!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(event).toBeDefined()
      expect(event!.details).toMatchObject({
        estateId: 'RENT_ESTATE_001',
        estateName: 'Rental Estate',
        days: 2,
        totalCost: 200,
        isExtension: true
      })
    })
  })
})