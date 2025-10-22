import { GET, POST } from '../route'
import {
  createMockGetRequest,
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  createTestUser,
  TEST_USERS,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'
import { generateSignature } from '@/lib/signature'

describe('/api/estate', () => {
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
    it('should create new estate successfully', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const estateData = createApiBody({
        estateId: 'TEST_ESTATE_001',
        name: 'Test Estate',
        description: 'A beautiful test estate for rent',
        rentPricePerDay: 100,
        location: 'Test Region <128, 128, 20>',
        universe: testUniverse,
      })

      const request = createMockPostRequest('/api/estate', estateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.data.estateId).toBe('TEST_ESTATE_001')
      expect(data.data.name).toBe('Test Estate')
      expect(data.data.description).toBe('A beautiful test estate for rent')
      expect(data.data.rentPricePerDay).toBe(100)
      expect(data.data.location).toBe('Test Region <128, 128, 20>')
      expect(data.data.isRented).toBe(false)
      expect(data.data.daysRemaining).toBe(0)
      expect(data.data.renterUuid).toBe(null)
      expect(data.data.renterName).toBe(null)
      expect(data.data.totalPaidAmount).toBe(0)

      // Verify estate was created in database
      const dbEstate = await prisma.estate.findUnique({
        where: {
          estateId_universe: {
            estateId: 'TEST_ESTATE_001',
            universe: testUniverse
          }
        }
      })
      expect(dbEstate).toBeDefined()
      expect(dbEstate!.name).toBe('Test Estate')
    })

    it('should update existing estate successfully', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      // First create an estate
      await prisma.estate.create({
        data: {
          estateId: 'TEST_ESTATE_UPDATE',
          name: 'Original Estate',
          description: 'Original description',
          rentPricePerDay: 50,
          location: 'Original Location',
          universe: testUniverse,
        }
      })

      // Now update it
      const updateData = createApiBody({
        estateId: 'TEST_ESTATE_UPDATE',
        name: 'Updated Estate',
        description: 'Updated description',
        rentPricePerDay: 150,
        location: 'Updated Location <200, 200, 30>',
        universe: testUniverse,
      })

      const request = createMockPostRequest('/api/estate', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.name).toBe('Updated Estate')
      expect(data.data.description).toBe('Updated description')
      expect(data.data.rentPricePerDay).toBe(150)
      expect(data.data.location).toBe('Updated Location <200, 200, 30>')

      // Verify update in database
      const dbEstate = await prisma.estate.findUnique({
        where: {
          estateId_universe: {
            estateId: 'TEST_ESTATE_UPDATE',
            universe: testUniverse
          }
        }
      })
      expect(dbEstate!.name).toBe('Updated Estate')
      expect(dbEstate!.rentPricePerDay).toBe(150)
    })

    it('should show rental status for rented estate', async () => {
      const testUser = TEST_USERS[0]
      const testUniverse = testUser.universe // Use universe from test user
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      // Create estate with active rental
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 5) // 5 days from now

      await prisma.estate.create({
        data: {
          estateId: 'RENTED_ESTATE',
          name: 'Rented Estate',
          description: 'Currently rented estate',
          rentPricePerDay: 200,
          location: 'Rented Location',
          rentingUserId: user!.id,
          rentStartDate: new Date(),
          rentEndDate: futureDate,
          totalPaidAmount: 1000,
          universe: testUniverse,
        }
      })

      const estateData = createApiBody({
        estateId: 'RENTED_ESTATE',
        name: 'Rented Estate',
        description: 'Currently rented estate',
        rentPricePerDay: 200,
        location: 'Rented Location',
        universe: testUniverse,
      })

      const request = createMockPostRequest('/api/estate', estateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.isRented).toBe(true)
      // Math.ceil() rounding + timing variations can result in 5 or 6 days
      expect(data.data.daysRemaining).toBeGreaterThanOrEqual(5)
      expect(data.data.daysRemaining).toBeLessThanOrEqual(6)
      expect(data.data.renterUuid).toBe(testUser.sl_uuid)
      expect(data.data.renterName).toBe(testUser.username)
      expect(data.data.totalPaidAmount).toBe(1000)
    })

    it('should reject estate creation with invalid signature', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const estateData = {
        estateId: 'TEST_ESTATE',
        name: 'Test Estate',
        description: 'Test description',
        rentPricePerDay: 100,
        location: 'Test Location',
        universe: testUniverse,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/estate', estateData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject estate with missing required fields', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const estateData = createApiBody({
        estateId: 'TEST_ESTATE',
        name: 'Test Estate',
        universe: testUniverse,
        // missing description, rentPricePerDay, location
      })

      const request = createMockPostRequest('/api/estate', estateData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid estate data')
        expect(response.status).toBe(400)
      })
    })

    it('should reject estate with invalid rent price', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const estateData = createApiBody({
        estateId: 'TEST_ESTATE',
        name: 'Test Estate',
        description: 'Test description',
        rentPricePerDay: -50, // Negative price
        location: 'Test Location',
        universe: testUniverse,
      })

      const request = createMockPostRequest('/api/estate', estateData)

      await testExpectedError('Invalid rent price', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid estate data')
        expect(response.status).toBe(400)
      })
    })

    it('should handle expired rental status correctly', async () => {
      const testUser = TEST_USERS[0]
      const testUniverse = testUser.universe // Use universe from test user
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      // Create estate with expired rental
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 2) // 2 days ago

      await prisma.estate.create({
        data: {
          estateId: 'EXPIRED_ESTATE',
          name: 'Expired Estate',
          description: 'Estate with expired rental',
          rentPricePerDay: 100,
          location: 'Expired Location',
          rentingUserId: user!.id,
          rentStartDate: new Date(pastDate.getTime() - (5 * 24 * 60 * 60 * 1000)), // 7 days ago start
          rentEndDate: pastDate,
          totalPaidAmount: 500,
          universe: testUniverse,
        }
      })

      const estateData = createApiBody({
        estateId: 'EXPIRED_ESTATE',
        name: 'Expired Estate',
        description: 'Estate with expired rental',
        rentPricePerDay: 100,
        location: 'Expired Location',
        universe: testUniverse,
      })

      const request = createMockPostRequest('/api/estate', estateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.isRented).toBe(false)
      expect(data.data.daysRemaining).toBe(0)
      expect(data.data.renterUuid).toBe(null)
      expect(data.data.renterName).toBe(null)
    })
  })

  describe('GET', () => {
    beforeEach(async () => {
      const testUser = TEST_USERS[0]
      const testUniverse = testUser.universe // Use universe from test user
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      // Create test estates
      await prisma.estate.createMany({
        data: [
          {
            estateId: 'ESTATE_A',
            name: 'Alpha Estate',
            description: 'First test estate',
            rentPricePerDay: 100,
            location: 'Alpha Location',
            totalPaidAmount: 0,
            universe: testUniverse,
          },
          {
            estateId: 'ESTATE_B',
            name: 'Beta Estate',
            description: 'Second test estate',
            rentPricePerDay: 150,
            location: 'Beta Location',
            rentingUserId: user!.id,
            rentStartDate: new Date(),
            rentEndDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
            totalPaidAmount: 450,
            universe: testUniverse,
          },
          {
            estateId: 'ESTATE_C',
            name: 'Gamma Estate',
            description: 'Third test estate',
            rentPricePerDay: 75,
            location: 'Gamma Location',
            totalPaidAmount: 0,
            universe: testUniverse,
          }
        ]
      })
    })

    it('should retrieve all estates successfully', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUniverse)
      const request = createMockGetRequest('/api/estate', {
        timestamp,
        signature,
        universe: testUniverse
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data).toHaveLength(3)
      
      // Should be sorted alphabetically by name
      expect(data.data[0].name).toBe('Alpha Estate')
      expect(data.data[1].name).toBe('Beta Estate')
      expect(data.data[2].name).toBe('Gamma Estate')
    })

    it('should show correct rental status for each estate', async () => {
      const testUser = TEST_USERS[0]
      const testUniverse = testUser.universe // Use universe from test user
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUniverse)
      const request = createMockGetRequest('/api/estate', {
        timestamp,
        signature,
        universe: testUniverse
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)

      // Find estates by ID
      const alphaEstate = data.data.find((e: { estateId: string }) => e.estateId === 'ESTATE_A')
      const betaEstate = data.data.find((e: { estateId: string }) => e.estateId === 'ESTATE_B')
      const gammaEstate = data.data.find((e: { estateId: string }) => e.estateId === 'ESTATE_C')

      // Alpha estate should not be rented
      expect(alphaEstate.isRented).toBe(false)
      expect(alphaEstate.daysRemaining).toBe(0)
      expect(alphaEstate.renterUuid).toBe(null)

      // Beta estate should be rented
      expect(betaEstate.isRented).toBe(true)
      expect(betaEstate.daysRemaining).toBe(3)
      expect(betaEstate.renterUuid).toBe(TEST_USERS[0].sl_uuid)
      expect(betaEstate.renterName).toBe(TEST_USERS[0].username)

      // Gamma estate should not be rented
      expect(gammaEstate.isRented).toBe(false)
      expect(gammaEstate.daysRemaining).toBe(0)
      expect(gammaEstate.renterUuid).toBe(null)
    })

    it('should reject request with invalid signature', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const request = createMockGetRequest('/api/estate', {
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        universe: testUniverse
      })

      await testExpectedError('Invalid signature', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should return empty array when no estates exist', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      // Clean up all estates
      await prisma.estate.deleteMany({})

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUniverse)
      const request = createMockGetRequest('/api/estate', {
        timestamp,
        signature,
        universe: testUniverse
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data).toHaveLength(0)
    })

    it('should include all required estate fields', async () => {
      const testUniverse = TEST_USERS[0].universe // Use universe from test users
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, testUniverse)
      const request = createMockGetRequest('/api/estate', {
        timestamp,
        signature,
        universe: testUniverse
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      
      const estate = data.data[0]
      expect(estate).toHaveProperty('estateId')
      expect(estate).toHaveProperty('name')
      expect(estate).toHaveProperty('description')
      expect(estate).toHaveProperty('rentPricePerDay')
      expect(estate).toHaveProperty('location')
      expect(estate).toHaveProperty('isRented')
      expect(estate).toHaveProperty('daysRemaining')
      expect(estate).toHaveProperty('renterUuid')
      expect(estate).toHaveProperty('renterName')
      expect(estate).toHaveProperty('totalPaidAmount')
      expect(estate).toHaveProperty('createdAt')
      expect(estate).toHaveProperty('updatedAt')
    })
  })
})