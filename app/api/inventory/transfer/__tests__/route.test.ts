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

describe('/api/inventory/transfer', () => {
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
    it('should transfer items between users successfully', async () => {
      const fromUser = TEST_USERS[0]
      const toUser = TEST_USERS[1]
      const testItem = TEST_ITEMS[0]

      await createTestUser(fromUser)
      await createTestUser(toUser)
      const createdItem = await createTestItem(testItem, fromUser.universe)

      // Add item to sender's inventory
      const sender = await prisma.user.findFirst({ where: { slUuid: fromUser.sl_uuid, universe: fromUser.universe } })
      await prisma.userInventory.create({
        data: {
          userId: sender!.id,
          rpItemId: createdItem.id,
          quantity: 10,
          useCount: 0,
        }
      })

      const transferData = createApiBody({
        from_uuid: fromUser.sl_uuid,
        to_uuid: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 3,
        universe: fromUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data.from_uuid).toBe(fromUser.sl_uuid)
      expect(data.data.to_uuid).toBe(toUser.sl_uuid)
      expect(data.data.shortName).toBe(testItem.shortName)
      expect(data.data.quantityTransferred).toBe(3)

      // Verify sender inventory reduced
      const senderInventory = await prisma.userInventory.findUnique({
        where: { userId_rpItemId: { userId: sender!.id, rpItemId: createdItem.id } }
      })
      expect(senderInventory.quantity).toBe(7)

      // Verify receiver got items
      const receiver = await prisma.user.findFirst({ where: { slUuid: toUser.sl_uuid, universe: toUser.universe } })
      const receiverInventory = await prisma.userInventory.findUnique({
        where: { userId_rpItemId: { userId: receiver!.id, rpItemId: createdItem.id } }
      })
      expect(receiverInventory.quantity).toBe(3)
    })

    it('should transfer items to existing inventory', async () => {
      const fromUser = TEST_USERS[0]
      const toUser = TEST_USERS[1]
      const testItem = TEST_ITEMS[0]

      await createTestUser(fromUser)
      await createTestUser(toUser)
      const createdItem = await createTestItem(testItem, fromUser.universe)

      const sender = await prisma.user.findFirst({ where: { slUuid: fromUser.sl_uuid, universe: fromUser.universe } })
      const receiver = await prisma.user.findFirst({ where: { slUuid: toUser.sl_uuid, universe: toUser.universe } })

      // Add item to both inventories
      await prisma.userInventory.create({
        data: { userId: sender!.id, rpItemId: createdItem.id, quantity: 5, useCount: 0 }
      })
      await prisma.userInventory.create({
        data: { userId: receiver!.id, rpItemId: createdItem.id, quantity: 2, useCount: 0 }
      })

      const transferData = createApiBody({
        from_uuid: fromUser.sl_uuid,
        to_uuid: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 3,
        universe: fromUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)

      // Verify sender inventory reduced
      const senderInventory = await prisma.userInventory.findUnique({
        where: { userId_rpItemId: { userId: sender!.id, rpItemId: createdItem.id } }
      })
      expect(senderInventory.quantity).toBe(2)

      // Verify receiver inventory increased
      const receiverInventory = await prisma.userInventory.findUnique({
        where: { userId_rpItemId: { userId: receiver!.id, rpItemId: createdItem.id } }
      })
      expect(receiverInventory.quantity).toBe(5) // 2 + 3
    })

    it('should reject transfer when sender has insufficient quantity', async () => {
      const fromUser = TEST_USERS[0]
      const toUser = TEST_USERS[1]
      const testItem = TEST_ITEMS[0]
      
      await createTestUser(fromUser)
      await createTestUser(toUser)
      const createdItem = await createTestItem(testItem, fromUser.universe)

      // Add small quantity to sender
      const sender = await prisma.user.findFirst({ where: { slUuid: fromUser.sl_uuid, universe: fromUser.universe } })
      await prisma.userInventory.create({
        data: { userId: sender!.id, rpItemId: createdItem.id, quantity: 2, useCount: 0 }
      })

      const transferData = createApiBody({
        from_uuid: fromUser.sl_uuid,
        to_uuid: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 5,
        universe: fromUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Insufficient quantity for transfer', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Insufficient quantity')
        expect(response.status).toBe(400)
      })
    })

    it('should reject transfer when sender does not have the item', async () => {
      const fromUser = TEST_USERS[0]
      const toUser = TEST_USERS[1]
      const testItem = TEST_ITEMS[0]
      
      await createTestUser(fromUser)
      await createTestUser(toUser)
      await createTestItem(testItem, fromUser.universe)
      // Note: Not adding item to sender's inventory

      const transferData = createApiBody({
        from_uuid: fromUser.sl_uuid,
        to_uuid: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 1,
        universe: fromUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Sender does not have item', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Insufficient quantity')
        expect(response.status).toBe(400)
      })
    })

    it('should reject transfer with invalid signature', async () => {
      const fromUser = TEST_USERS[0]
      const toUser = TEST_USERS[1]
      const testItem = TEST_ITEMS[0]

      const transferData = {
        from_uuid: fromUser.sl_uuid,
        to_uuid: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 1,
        universe: fromUser.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Invalid signature')
        expect(response.status).toBe(401)
      })
    })

    it('should reject transfer when sender user does not exist', async () => {
      const toUser = TEST_USERS[1]
      const testItem = TEST_ITEMS[0]
      
      await createTestUser(toUser)
      await createTestItem(testItem, toUser.universe)

      const transferData = createApiBody({
        from_uuid: generateTestUUID(),
        to_uuid: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 1,
        universe: toUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Sender user not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'User not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject transfer when receiver user does not exist', async () => {
      const fromUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      
      await createTestUser(fromUser)
      await createTestItem(testItem, fromUser.universe)

      const transferData = createApiBody({
        from_uuid: fromUser.sl_uuid,
        to_uuid: generateTestUUID(),
        shortName: testItem.shortName,
        quantity: 1,
        universe: fromUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Receiver user not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'User not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject transfer of non-existent item', async () => {
      const fromUser = TEST_USERS[0]
      const toUser = TEST_USERS[1]
      
      await createTestUser(fromUser)
      await createTestUser(toUser)

      const transferData = createApiBody({
        from_uuid: fromUser.sl_uuid,
        to_uuid: toUser.sl_uuid,
        shortName: 'NON_EXISTENT_ITEM',
        quantity: 1,
        universe: fromUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Item not found', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Item not found')
        expect(response.status).toBe(404)
      })
    })

    it('should reject transfer with missing required fields', async () => {
      const transferData = createApiBody({
        from_uuid: TEST_USERS[0].sl_uuid,
        universe: TEST_USERS[0].universe,
        // missing to_uuid, shortName, quantity
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject transfer with zero quantity', async () => {
      const transferData = createApiBody({
        from_uuid: TEST_USERS[0].sl_uuid,
        to_uuid: TEST_USERS[1].sl_uuid,
        shortName: TEST_ITEMS[0].shortName,
        quantity: 0,
        universe: TEST_USERS[0].universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Zero quantity validation', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject transfer to same user', async () => {
      const transferData = createApiBody({
        from_uuid: TEST_USERS[0].sl_uuid,
        to_uuid: TEST_USERS[0].sl_uuid, // Same user
        shortName: TEST_ITEMS[0].shortName,
        quantity: 1,
        universe: TEST_USERS[0].universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)

      await testExpectedError('Transfer to same user validation', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should create transfer events for both users', async () => {
      const fromUser = TEST_USERS[0]
      const toUser = TEST_USERS[1]
      const testItem = TEST_ITEMS[0]
      
      await createTestUser(fromUser)
      await createTestUser(toUser)
      const createdItem = await createTestItem(testItem, fromUser.universe)

      const sender = await prisma.user.findFirst({ where: { slUuid: fromUser.sl_uuid, universe: fromUser.universe } })
      const receiver = await prisma.user.findFirst({ where: { slUuid: toUser.sl_uuid, universe: toUser.universe } })

      // Add item to sender's inventory
      await prisma.userInventory.create({
        data: { userId: sender!.id, rpItemId: createdItem.id, quantity: 5, useCount: 0 }
      })

      const transferData = createApiBody({
        from_uuid: fromUser.sl_uuid,
        to_uuid: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 2,
        universe: fromUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/transfer', transferData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)

      // Verify transfer OUT event for sender
      const senderEvent = await prisma.event.findFirst({
        where: {
          type: 'INVENTORY_TRANSFER_OUT',
          userId: sender!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(senderEvent).toBeDefined()
      expect(senderEvent!.details).toMatchObject({
        to: toUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 2
      })

      // Verify transfer IN event for receiver
      const receiverEvent = await prisma.event.findFirst({
        where: {
          type: 'INVENTORY_TRANSFER_IN',
          userId: receiver!.id,
        },
        orderBy: { timestamp: 'desc' }
      })

      expect(receiverEvent).toBeDefined()
      expect(receiverEvent!.details).toMatchObject({
        from: fromUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 2
      })
    })
  })
})