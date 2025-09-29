/* eslint-disable @typescript-eslint/no-explicit-any */
import { POST } from '../route'
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  testExpectedError,
  createTestUser,
  createTestItem,
  TEST_USERS,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'

interface TestUser {
  id: number
  slUuid: string
}

interface TestStation {
  id: number
  stationId: string
}

interface TestRecipe {
  id: number
  shortName: string
  craftingTime: number
  outputItemShortName: string
  outputItemQuantity: number
  exp: number
}

interface TestItems {
  flour: { id: number }
  bread: { id: number }
}

interface TestCrafting {
  id: number
}

describe('/api/recipes/complete', () => {
  let testUser: TestUser
  let testStation: TestStation
  let testRecipe: TestRecipe
  let testItems: TestItems
  let testCrafting: TestCrafting

  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()

    // Create test user
    testUser = await createTestUser(TEST_USERS[0])

    // Create test items
    const flour = await createTestItem({
      name: 'Test Flour',
      shortName: 'FLOUR',
      category: 'Food',
      universe: 'Gor'
    })
    const bread = await createTestItem({
      name: 'Test Bread',
      shortName: 'BREAD',
      category: 'Food',
      universe: 'Gor'
    })

    testItems = { flour, bread }

    // Create test crafting station
    testStation = await (prisma as any).craftingStation.create({
      data: {
        stationId: 'test-cooking-station',
        universe: 'Gor',
        name: 'Test Cooking Fire',
        type: 'cooking',
        busy: true // Station should be busy when crafting
      }
    })

    // Create test recipe
    testRecipe = await (prisma as any).recipe.create({
      data: {
        name: 'Simple Bread',
        shortName: 'SIMPLE_BREAD',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
        craftingTime: 1, // Short time for testing
        outputItemShortName: 'BREAD',
        outputItemQuantity: 2,
        knowledge: '',
        tool: '',
        license: '',
        category: 'Food',
        tags: 'basic',
        exp: 10
      }
    })
  })

  async function createCompletedCrafting() {
    // Create crafting that started in the past (completed)
    const pastTime = new Date(Date.now() - 5000) // 5 seconds ago
    testCrafting = await (prisma as any).crafting.create({
      data: {
        universe: 'Gor',
        userId: testUser.id,
        craftingStationId: testStation.id,
        recipeShortName: testRecipe.shortName,
        startTime: pastTime,
        collected: false
      }
    })
  }


  it('should complete crafting successfully', async () => {
    await createCompletedCrafting()

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(response.status).toBe(200)
    expect(data.data.message).toBe('Crafting completed successfully')
    expect(data.data.outputItem).toBe('BREAD')
    expect(data.data.outputQuantity).toBe(2)
    expect(data.data.expAwarded).toBe(10)

    // Verify output item was added to inventory
    const inventory = await (prisma as any).userInventory.findFirst({
      where: {
        userId: testUser.id,
        rpItemId: testItems.bread.id
      }
    })
    expect(inventory).toBeDefined()
    expect(inventory.quantity).toBe(2)

    // Verify crafting was marked as collected
    const updatedCrafting = await (prisma as any).crafting.findUnique({
      where: { id: testCrafting.id }
    })
    expect(updatedCrafting.collected).toBe(true)

    // Verify station is no longer busy
    const updatedStation = await (prisma as any).craftingStation.findUnique({
      where: { id: testStation.id }
    })
    expect(updatedStation.busy).toBe(false)

    // Verify completion event was logged
    const completionEvent = await (prisma as any).event.findFirst({
      where: {
        userId: testUser.id,
        type: 'CRAFTING_COMPLETE'
      }
    })
    expect(completionEvent).toBeDefined()
    expect(completionEvent.details.recipeShortName).toBe(testRecipe.shortName)

    // Verify experience event was logged
    const expEvent = await (prisma as any).event.findFirst({
      where: {
        userId: testUser.id,
        type: 'CRAFTING_EXP'
      }
    })
    expect(expEvent).toBeDefined()
    expect(expEvent.details.expAwarded).toBe(10)
  })

  it('should add to existing inventory when output item already exists', async () => {
    await createCompletedCrafting()

    // Add existing bread to inventory
    await (prisma as any).userInventory.create({
      data: {
        userId: testUser.id,
        rpItemId: testItems.bread.id,
        quantity: 3,
        useCount: 0,
        priceGold: 0,
        priceSilver: 0,
        priceCopper: 5
      }
    })

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)

    // Verify quantity was added to existing inventory
    const inventory = await (prisma as any).userInventory.findFirst({
      where: {
        userId: testUser.id,
        rpItemId: testItems.bread.id
      }
    })
    expect(inventory.quantity).toBe(5) // 3 existing + 2 crafted = 5
  })

  it('should reject completion when crafting time not elapsed', async () => {
    // Create recipe with longer crafting time
    const longRecipe = await (prisma as any).recipe.create({
      data: {
        name: 'Long Bread',
        shortName: 'LONG_BREAD',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
        craftingTime: 3600, // 1 hour
        outputItemShortName: 'BREAD',
        outputItemQuantity: 1,
        knowledge: '',
        tool: '',
        license: '',
        category: 'Food',
        tags: 'long',
        exp: 50
      }
    })

    // Create crafting that just started
    testCrafting = await (prisma as any).crafting.create({
      data: {
        universe: 'Gor',
        userId: testUser.id,
        craftingStationId: testStation.id,
        recipeShortName: longRecipe.shortName,
        startTime: new Date(), // Just started
        collected: false
      }
    })

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)

    await testExpectedError('Crafting not complete', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Crafting not complete yet')
      expect(response.status).toBe(500)
    })
  })

  it('should handle no active crafting gracefully', async () => {
    // Station is busy but no crafting record
    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Station reset, no active crafting found')

    // Verify station was reset to not busy
    const updatedStation = await (prisma as any).craftingStation.findUnique({
      where: { id: testStation.id }
    })
    expect(updatedStation.busy).toBe(false)
  })

  it('should handle no active crafting when station not busy', async () => {
    // Set station to not busy
    await (prisma as any).craftingStation.update({
      where: { id: testStation.id },
      data: { busy: false }
    })

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('No active crafting found')
  })

  it('should reject completion with non-existent user', async () => {
    await createCompletedCrafting()

    const completeData = createApiBody({
      sl_uuid: '550e8400-e29b-41d4-a716-000000000000', // Non-existent UUID
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)

    await testExpectedError('User not found', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })
  })

  it('should reject completion with non-existent station', async () => {
    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: 'non-existent-station'
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)

    await testExpectedError('Station not found', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Crafting station not found')
      expect(response.status).toBe(404)
    })
  })

  it('should handle missing output item gracefully', async () => {
    await createCompletedCrafting()

    // Delete the output item to simulate error
    await prisma.rpItem.delete({
      where: { id: testItems.bread.id }
    })

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)

    await testExpectedError('Output item not found', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Output item \'BREAD\' not found')
      expect(response.status).toBe(404)
    })
  })

  it('should not award experience when recipe has no exp', async () => {
    // Update recipe to have no experience
    await (prisma as any).recipe.update({
      where: { id: testRecipe.id },
      data: { exp: 0 }
    })

    await createCompletedCrafting()

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.expAwarded).toBe(0)

    // Verify no experience event was logged
    const expEvent = await (prisma as any).event.findFirst({
      where: {
        userId: testUser.id,
        type: 'CRAFTING_EXP'
      }
    })
    expect(expEvent).toBeNull()
  })

  it('should reject completion with invalid signature', async () => {
    await createCompletedCrafting()

    const completeData = {
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      timestamp: new Date().toISOString(),
      signature: 'invalid_signature'
    }

    const request = createMockPostRequest('/api/recipes/complete', completeData)

    await testExpectedError('Invalid signature', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'fails to match the required pattern')
      expect(response.status).toBe(400)
    })
  })

  it('should reject completion with missing required fields', async () => {
    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      // missing stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)

    await testExpectedError('Missing required fields', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })

  it('should handle already collected crafting', async () => {
    await createCompletedCrafting()

    // Mark crafting as already collected
    await (prisma as any).crafting.update({
      where: { id: testCrafting.id },
      data: { collected: true }
    })

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Station reset, no active crafting found')
  })

  it('should preserve existing item properties when adding to inventory', async () => {
    await createCompletedCrafting()

    const completeData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId
    })

    const request = createMockPostRequest('/api/recipes/complete', completeData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)

    // Verify inventory item has correct properties from rpItem
    const inventory = await (prisma as any).userInventory.findFirst({
      where: {
        userId: testUser.id,
        rpItemId: testItems.bread.id
      }
    })
    expect(inventory.useCount).toBe(testItems.bread.useCount)
    expect(inventory.priceGold).toBe(testItems.bread.priceGold)
    expect(inventory.priceSilver).toBe(testItems.bread.priceSilver)
    expect(inventory.priceCopper).toBe(testItems.bread.priceCopper)
  })
})