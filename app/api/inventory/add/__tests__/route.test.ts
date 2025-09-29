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
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'

describe('/api/inventory/add', () => {
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
    it('should add new item to user inventory successfully', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      await createTestItem(testItem)

      const addData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 5,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/add', addData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data.sl_uuid).toBe(testUser.sl_uuid)
      expect(data.data.shortName).toBe(testItem.shortName)
      expect(data.data.quantityAdded).toBe(5)
      expect(data.data.newQuantity).toBe(5)
    })

    it('should update existing item quantity in inventory', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      await createTestItem(testItem)

      // First add item with quantity 3
      const addData1 = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 3,
        universe: testUser.universe,
      })

      await POST(createMockPostRequest('/api/inventory/add', addData1))

      // Then add 2 more of the same item
      const addData2 = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 2,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/add', addData2)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.quantityAdded).toBe(2)
      expect(data.data.newQuantity).toBe(5) // 3 + 2
    })

    it('should reject adding item with invalid signature', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      await createTestItem(testItem)

      const addData = {
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 1,
        universe: testUser.universe,
        timestamp: new Date().toISOString(),
        signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      }

      const request = createMockPostRequest('/api/inventory/add', addData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Invalid signature')
      expect(response.status).toBe(401)
    })

    it('should reject adding item for non-existent user', async () => {
      const testItem = TEST_ITEMS[0]
      await createTestItem(testItem)

      const addData = createApiBody({
        sl_uuid: generateTestUUID(),
        shortName: testItem.shortName,
        quantity: 1,
        universe: 'Gor',
      })

      const request = createMockPostRequest('/api/inventory/add', addData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })

    it('should reject adding non-existent item', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const addData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: 'NON_EXISTENT_ITEM',
        quantity: 1,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/add', addData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Item not found')
      expect(response.status).toBe(404)
    })

    it('should reject adding item with missing required fields', async () => {
      const testUser = TEST_USERS[0]
      await createTestUser(testUser)

      const addData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        // missing shortName
        quantity: 1,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/add', addData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })

    it('should reject adding item with zero quantity', async () => {
      const testUser = TEST_USERS[0]
      const testItem = TEST_ITEMS[0]
      await createTestUser(testUser)
      await createTestItem(testItem)

      const addData = createApiBody({
        sl_uuid: testUser.sl_uuid,
        shortName: testItem.shortName,
        quantity: 0,
        universe: testUser.universe,
      })

      const request = createMockPostRequest('/api/inventory/add', addData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })
})