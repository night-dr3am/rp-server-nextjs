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

// Mock the params promise
const createMockParams = (estateId: string) => Promise.resolve({ estateId })

describe('/api/estate/[estateId]', () => {
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
    beforeEach(async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })

      // Create test estates
      await prisma.estate.create({
        data: {
          estateId: 'DETAIL_ESTATE_001',
          name: 'Detailed Estate',
          description: 'Estate for detail testing',
          rentPricePerDay: 200,
          location: 'Detail Location <100, 100, 25>',
          totalPaidAmount: 0,
          universe: 'Gor',
        }
      })

      await prisma.estate.create({
        data: {
          estateId: 'RENTED_DETAIL_ESTATE',
          name: 'Rented Detail Estate',
          description: 'Currently rented estate for detail testing',
          rentPricePerDay: 150,
          location: 'Rented Detail Location',
          rentingUserId: user!.id,
          rentStartDate: new Date(),
          rentEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          totalPaidAmount: 1050,
          universe: 'Gor',
        }
      })

      await prisma.estate.create({
        data: {
          estateId: 'EXPIRED_DETAIL_ESTATE',
          name: 'Expired Detail Estate',
          description: 'Estate with expired rental',
          rentPricePerDay: 100,
          location: 'Expired Detail Location',
          rentingUserId: user!.id,
          rentStartDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          rentEndDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
          totalPaidAmount: 700,
          universe: 'Gor',
        }
      })
    })

    it('should retrieve estate details successfully', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/estate/DETAIL_ESTATE_001', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request, { params: createMockParams('DETAIL_ESTATE_001') })
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.data.estateId).toBe('DETAIL_ESTATE_001')
      expect(data.data.name).toBe('Detailed Estate')
      expect(data.data.description).toBe('Estate for detail testing')
      expect(data.data.rentPricePerDay).toBe(200)
      expect(data.data.location).toBe('Detail Location <100, 100, 25>')
      expect(data.data.isRented).toBe(false)
      expect(data.data.isExpired).toBe(false)
      expect(data.data.daysRemaining).toBe(0)
      expect(data.data.renterUuid).toBe(null)
      expect(data.data.renterName).toBe(null)
      expect(data.data.totalPaidAmount).toBe(0)
      expect(data.data.tenants).toEqual([])
    })

    it('should retrieve rented estate details with correct status', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/estate/RENTED_DETAIL_ESTATE', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request, { params: createMockParams('RENTED_DETAIL_ESTATE') })
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.estateId).toBe('RENTED_DETAIL_ESTATE')
      expect(data.data.isRented).toBe(true)
      expect(data.data.isExpired).toBe(false)
      expect(data.data.daysRemaining).toBe(7)
      expect(data.data.renterUuid).toBe(TEST_USERS[0].sl_uuid)
      expect(data.data.renterName).toBe(TEST_USERS[0].username)
      expect(data.data.totalPaidAmount).toBe(1050)
      expect(data.data.rentStartDate).toBeDefined()
      expect(data.data.rentEndDate).toBeDefined()
    })

    it('should show expired status for estates with expired rentals', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/estate/EXPIRED_DETAIL_ESTATE', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request, { params: createMockParams('EXPIRED_DETAIL_ESTATE') })
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.estateId).toBe('EXPIRED_DETAIL_ESTATE')
      expect(data.data.isRented).toBe(false)
      expect(data.data.isExpired).toBe(true)
      expect(data.data.daysRemaining).toBe(0)
      expect(data.data.totalPaidAmount).toBe(700)
    })

    it('should return 404 for non-existent estate', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/estate/NON_EXISTENT_ESTATE', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      await testExpectedError('Estate not found', async () => {
        const response = await GET(request, { params: createMockParams('NON_EXISTENT_ESTATE') })
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Estate not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject request with invalid signature', async () => {
      const request = createMockGetRequest('/api/estate/DETAIL_ESTATE_001', {
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        universe: 'Gor'
      })

      await testExpectedError('Invalid signature', async () => {
        const response = await GET(request, { params: createMockParams('DETAIL_ESTATE_001') })
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should return 404 for non-matching estate ID format', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/estate/invalid-estate-id-format', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      await testExpectedError('Estate not found', async () => {
        const response = await GET(request, { params: createMockParams('invalid-estate-id-format') })
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Estate not found')
        expect(response.status).toBe(404)
      })
    })

    it('should include all required estate detail fields', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/estate/DETAIL_ESTATE_001', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request, { params: createMockParams('DETAIL_ESTATE_001') })
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      
      const estate = data.data
      expect(estate).toHaveProperty('estateId')
      expect(estate).toHaveProperty('name')
      expect(estate).toHaveProperty('description')
      expect(estate).toHaveProperty('rentPricePerDay')
      expect(estate).toHaveProperty('location')
      expect(estate).toHaveProperty('isRented')
      expect(estate).toHaveProperty('isExpired')
      expect(estate).toHaveProperty('daysRemaining')
      expect(estate).toHaveProperty('renterUuid')
      expect(estate).toHaveProperty('renterName')
      expect(estate).toHaveProperty('tenants')
      expect(estate).toHaveProperty('totalPaidAmount')
      expect(estate).toHaveProperty('rentStartDate')
      expect(estate).toHaveProperty('rentEndDate')
      expect(estate).toHaveProperty('createdAt')
      expect(estate).toHaveProperty('updatedAt')
    })

    it('should include tenant information when available', async () => {
      // Add a tenant to the estate
      const testUser2 = TEST_USERS[1]
      await createTestUser(testUser2)
      const user2 = await prisma.user.findFirst({ where: { slUuid: testUser2.sl_uuid, universe: testUser2.universe } })

      await prisma.estate.update({
        where: {
          estateId_universe: {
            estateId: 'DETAIL_ESTATE_001',
            universe: 'Gor'
          }
        },
        data: {
          tenants: {
            connect: { id: user2!.id }
          }
        }
      })

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/estate/DETAIL_ESTATE_001', {
        timestamp,
        signature,
        universe: 'Gor'
      })

      const response = await GET(request, { params: createMockParams('DETAIL_ESTATE_001') })
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(data.data.tenants).toHaveLength(1)
      expect(data.data.tenants[0].slUuid).toBe(testUser2.sl_uuid)
      expect(data.data.tenants[0].username).toBe(testUser2.username)
    })
  })

  describe('POST', () => {
    it('should return estate details same as GET', async () => {
      const testUser = TEST_USERS[0]
      const testUniverse = testUser.universe
      await createTestUser(testUser)

      // Create a test estate
      await prisma.estate.create({
        data: {
          estateId: 'TEST_POST_ESTATE',
          name: 'Test POST Estate',
          description: 'Estate for POST test',
          rentPricePerDay: 200,
          location: 'POST Test Location',
          universe: testUniverse,
        }
      })

      const postData = createApiBody({
        universe: testUniverse,
      })

      const response = await POST(createMockPostRequest('/api/estate/TEST_POST_ESTATE', postData), {
        params: createMockParams('TEST_POST_ESTATE')
      })
      const data = await parseJsonResponse(response)

      expect(data.success).toBe(true)
      expect(response.status).toBe(200)
      expect(data.data.estateId).toBe('TEST_POST_ESTATE')
      expect(data.data.name).toBe('Test POST Estate')
      expect(data.data.description).toBe('Estate for POST test')
    })

    it('should reject request with invalid signature', async () => {
      const request = createMockPostRequest('/api/estate/TEST_ESTATE', {
        universe: 'Gor',
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        data: 'test'
      })

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request, { params: createMockParams('TEST_ESTATE') })
        const data = await parseJsonResponse(response)

        expect(data.error).toBe('Invalid signature')
        expect(response.status).toBe(401)
      })
    })
  })
})