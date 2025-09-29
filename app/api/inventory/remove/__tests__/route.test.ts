import { POST } from '../route'
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  createTestUser,
  createTestItem,
  TEST_USERS,
  TEST_ITEMS,
  expectSuccess,
  expectError,
  generateTestUUID,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'

describe('/api/inventory/remove', () => {
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
    it('should remove partial quantity from user inventory successfully', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      const createdItem = await createTestItem(testItem, testUser.universe)

      // First add item with quantity 10
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      await prisma.userInventory.create({
        data: {
          userId: user!.id,
          rpItemId: createdItem.id,
          quantity: 10,
          useCount: 0,
        }
      })

      // Remove 3 items
      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 3,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data.sl_uuid).toBe(testUser.sl_uuid)
      expect(data.data.shortName).toBe(testItem.shortName)
      expect(data.data.quantityRemoved).toBe(3)
      expect(data.data.newQuantity).toBe(7)
    })

    it('should remove all items from inventory when quantity equals current quantity', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      const createdItem = await createTestItem(testItem, testUser.universe)

      // Add item with quantity 5
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      await prisma.userInventory.create({
        data: {
          userId: user!.id,
          rpItemId: createdItem.id,
          quantity: 5,
          useCount: 0,
        }
      })

      // Remove all 5 items
      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 5,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.quantityRemoved).toBe(5)
      expect(data.data.newQuantity).toBe(0)

      // Verify item is deleted from inventory
      const inventoryItem = await prisma.userInventory.findUnique({
        where: { userId_rpItemId: { userId: user!.id, rpItemId: createdItem.id } }
      })
      expect(inventoryItem).toBeNull()
    })

    it('should reject removing more items than available in inventory', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      const createdItem = await createTestItem(testItem, testUser.universe)

      // Add item with quantity 3
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      await prisma.userInventory.create({
        data: {
          userId: user!.id,
          rpItemId: createdItem.id,
          quantity: 3,
          useCount: 0,
        }
      })

      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 5,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      
      await testExpectedError('Insufficient quantity in inventory', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Insufficient quantity')
        expect(response.status).toBe(400)
      })
    })

    it('should reject removing items that user does not have', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      await createTestItem(testItem, testUser.universe)
      // Note: Not adding item to user inventory

      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 1,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      
      await testExpectedError('Item not in user inventory', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Insufficient quantity')
        expect(response.status).toBe(400)
      })
    })

    it('should reject removing item with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      await createTestItem(testItem, testUser.universe)

      const removeData = {
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 1,
        universe: testUser.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      
      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject removing item for non-existent user', async () => {
      const testItem = TEST_ITEMS[0]
      const testUniverse = TEST_USERS[0].universe
      await createTestItem(testItem, testUniverse)

      const removeData = createApiBody({
        sl_uuid: generateTestUUID(),
        shortName: testItem.shortName,
        quantity: 1,
        universe: testUniverse,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      
      await testExpectedError('User not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'User not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject removing non-existent item', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: 'NON_EXISTENT_ITEM',
        quantity: 1,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      
      await testExpectedError('Item not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Item not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject removing item with missing required fields', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        // missing shortName
        quantity: 1,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      
      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject removing item with zero quantity', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      await createTestItem(testItem, testUser.universe)

      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 0,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      
      await testExpectedError('Zero quantity validation', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should create inventory event when removing items', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      const createdItem = await createTestItem(testItem, testUser.universe)

      // Add item to inventory first
      const user = await prisma.user.findFirst({ where: { slUuid: testUser.sl_uuid, universe: testUser.universe } })
      await prisma.userInventory.create({
        data: {
          userId: user!.id,
          rpItemId: createdItem.id,
          quantity: 5,
          useCount: 0,
        }
      })

      const removeData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 2,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/remove', removeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)

      // Verify event was created
      const event = await prisma.event.findFirst({
        where: {
          type: 'INVENTORY_REMOVE',
          userId: user!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(event).toBeDefined()
      expect(event!.details).toMatchObject({
        shortName: testItem.shortName,
        quantity: 2
      })
    })
  })
})