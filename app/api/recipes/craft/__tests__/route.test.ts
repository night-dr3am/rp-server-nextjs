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
  shortName: string
}

interface TestItems {
  flour: { id: number }
  water: { id: number }
  bread: { id: number }
}

describe('/api/recipes/craft', () => {
  let testUser: TestUser
  let testStation: TestStation
  let testRecipe: TestRecipe
  let testItems: TestItems

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
    const water = await createTestItem({
      name: 'Test Water',
      shortName: 'WATER',
      category: 'Drinks',
      universe: 'Gor'
    })
    const bread = await createTestItem({
      name: 'Test Bread',
      shortName: 'BREAD',
      category: 'Food',
      universe: 'Gor'
    })

    testItems = { flour, water, bread }

    // Add ingredients to user's inventory
    await (prisma as any).userInventory.createMany({
      data: [
        {
          userId: testUser.id,
          rpItemId: flour.id,
          quantity: 5,
          useCount: 0,
          priceGold: 0,
          priceSilver: 0,
          priceCopper: 1
        },
        {
          userId: testUser.id,
          rpItemId: water.id,
          quantity: 3,
          useCount: 0,
          priceGold: 0,
          priceSilver: 0,
          priceCopper: 1
        }
      ]
    })

    // Create test crafting station
    testStation = await (prisma as any).craftingStation.create({
      data: {
        stationId: 'test-cooking-station',
        universe: 'Gor',
        name: 'Test Cooking Fire',
        type: 'cooking',
        busy: false
      }
    })

    // Create test recipe
    testRecipe = await (prisma as any).recipe.create({
      data: {
        name: 'Simple Bread',
        shortName: 'SIMPLE_BREAD',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [
          { quantity: 2, rpItemShortName: 'FLOUR' },
          { quantity: 1, rpItemShortName: 'WATER' }
        ],
        craftingTime: 30,
        outputItemShortName: 'BREAD',
        outputItemQuantity: 1,
        knowledge: '',
        tool: '',
        license: '',
        category: 'Food',
        tags: 'basic',
        exp: 5
      }
    })
  })

  it('should start crafting successfully', async () => {
    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: testRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(response.status).toBe(200)
    expect(data.data.message).toBe('Crafting started successfully')
    expect(data.data.craftingTime).toBe(30)

    // Verify ingredients were deducted from inventory
    const updatedFlour = await (prisma as any).userInventory.findFirst({
      where: {
        userId: testUser.id,
        rpItemId: testItems.flour.id
      }
    })
    expect(updatedFlour.quantity).toBe(3) // 5 - 2 = 3

    const updatedWater = await (prisma as any).userInventory.findFirst({
      where: {
        userId: testUser.id,
        rpItemId: testItems.water.id
      }
    })
    expect(updatedWater.quantity).toBe(2) // 3 - 1 = 2

    // Verify crafting record was created
    const crafting = await (prisma as any).crafting.findFirst({
      where: {
        userId: testUser.id,
        craftingStationId: testStation.id
      }
    })
    expect(crafting).toBeDefined()
    expect(crafting.recipeShortName).toBe(testRecipe.shortName)
    expect(crafting.collected).toBe(false)

    // Verify station is marked as busy
    const updatedStation = await (prisma as any).craftingStation.findUnique({
      where: { id: testStation.id }
    })
    expect(updatedStation.busy).toBe(true)
  })

  it('should reject crafting with insufficient ingredients', async () => {
    // Update inventory to have insufficient flour
    await (prisma as any).userInventory.updateMany({
      where: {
        userId: testUser.id,
        rpItemId: testItems.flour.id
      },
      data: { quantity: 1 } // Need 2 but only have 1
    })

    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: testRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Insufficient ingredients', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Insufficient FLOUR. Required: 2, Available: 1')
      expect(response.status).toBe(500)
    })
  })

  it('should reject crafting when station is busy', async () => {
    // Mark station as busy
    await (prisma as any).craftingStation.update({
      where: { id: testStation.id },
      data: { busy: true }
    })

    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: testRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Station busy', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Crafting station is currently busy')
      expect(response.status).toBe(500)
    })
  })

  it('should reject crafting with wrong station type', async () => {
    // Create station of different type
    const smithingStation = await (prisma as any).craftingStation.create({
      data: {
        stationId: 'test-smithing-station',
        universe: 'Gor',
        name: 'Test Forge',
        type: 'smithing',
        busy: false
      }
    })

    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: smithingStation.stationId,
      recipeShortName: testRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Wrong station type', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Recipe requires cooking station, but this is a smithing station')
      expect(response.status).toBe(500)
    })
  })

  it('should reject crafting with non-existent user', async () => {
    const craftData = createApiBody({
      sl_uuid: '550e8400-e29b-41d4-a716-000000000000', // Non-existent UUID
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: testRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('User not found', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found')
      expect(response.status).toBe(404)
    })
  })

  it('should reject crafting with non-existent station', async () => {
    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: 'non-existent-station',
      recipeShortName: testRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Station not found', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Crafting station not found')
      expect(response.status).toBe(404)
    })
  })

  it('should reject crafting with non-existent recipe', async () => {
    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: 'NON_EXISTENT_RECIPE'
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Recipe not found', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Recipe not found')
      expect(response.status).toBe(404)
    })
  })

  it('should allow crafting known recipe with requirements', async () => {
    // Create advanced recipe with requirements
    const advancedRecipe = await (prisma as any).recipe.create({
      data: {
        name: 'Advanced Bread',
        shortName: 'ADVANCED_BREAD',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
        craftingTime: 60,
        outputItemShortName: 'BREAD',
        outputItemQuantity: 2,
        knowledge: 'Advanced Cooking',
        tool: 'Special Oven',
        license: 'Master Baker',
        category: 'Food',
        tags: 'advanced',
        exp: 15
      }
    })

    // Add recipe to user's known recipes
    await prisma.user.update({
      where: { id: testUser.id },
      data: { knownRecipes: ['ADVANCED_BREAD'] }
    })

    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: advancedRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Crafting started successfully')
    expect(data.data.craftingTime).toBe(60)
  })

  it('should reject crafting recipe with requirements not known by user', async () => {
    // Create advanced recipe with requirements
    const advancedRecipe = await (prisma as any).recipe.create({
      data: {
        name: 'Secret Recipe',
        shortName: 'SECRET_RECIPE',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
        craftingTime: 60,
        outputItemShortName: 'BREAD',
        outputItemQuantity: 2,
        knowledge: 'Secret Knowledge',
        tool: 'Magic Tool',
        license: 'Secret License',
        category: 'Food',
        tags: 'secret',
        exp: 20
      }
    })

    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: advancedRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Recipe requirements not met', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'You do not have the required knowledge, tools, or license for this recipe')
      expect(response.status).toBe(500)
    })
  })

  it('should reject crafting with invalid signature', async () => {
    const craftData = {
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: testRecipe.shortName,
      timestamp: new Date().toISOString(),
      signature: 'invalid_signature'
    }

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Invalid signature', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'fails to match the required pattern')
      expect(response.status).toBe(400)
    })
  })

  it('should reject crafting with missing required fields', async () => {
    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      // missing stationId and recipeShortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Missing required fields', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data)
      expect(response.status).toBe(400)
    })
  })

  it('should handle missing ingredient in inventory gracefully', async () => {
    // Remove all water from inventory
    await (prisma as any).userInventory.deleteMany({
      where: {
        userId: testUser.id,
        rpItemId: testItems.water.id
      }
    })

    const craftData = createApiBody({
      sl_uuid: testUser.slUuid,
      universe: 'Gor',
      stationId: testStation.stationId,
      recipeShortName: testRecipe.shortName
    })

    const request = createMockPostRequest('/api/recipes/craft', craftData)

    await testExpectedError('Missing ingredient', async () => {
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'Insufficient WATER. Required: 1, Available: 0')
      expect(response.status).toBe(500)
    })
  })
})