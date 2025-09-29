/* eslint-disable @typescript-eslint/no-explicit-any */
import { GET, POST } from '../route'
import {
  createMockGetRequest,
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
import { generateSignature } from '@/lib/signature'

describe('/api/recipes', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  describe('POST - Recipe Upsert', () => {
    beforeEach(async () => {
      // Create test items for recipes
      await createTestItem({
        name: 'Test Flour',
        shortName: 'FLOUR',
        category: 'Food',
        universe: 'Gor'
      })
      await createTestItem({
        name: 'Test Water',
        shortName: 'WATER',
        category: 'Drinks',
        universe: 'Gor'
      })
      await createTestItem({
        name: 'Test Bread',
        shortName: 'BREAD',
        category: 'Food',
        universe: 'Gor'
      })
    })

    it('should create new recipe successfully', async () => {
      const recipeData = createApiBody({
        name: 'Simple Bread',
        shortName: 'BREAD_RECIPE',
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
        tags: 'basic,bread',
        exp: 5
      })

      const request = createMockPostRequest('/api/recipes', recipeData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data.name).toBe('Simple Bread')
      expect(data.data.shortName).toBe('BREAD_RECIPE')
      expect(data.data.craftingStationType).toBe('cooking')
      expect(data.data.craftingTime).toBe(30)

      // Verify recipe was created in database
      const dbRecipe = await (prisma as any).recipe.findUnique({
        where: {
          shortName_universe: {
            shortName: 'BREAD_RECIPE',
            universe: 'Gor'
          }
        }
      })
      expect(dbRecipe).toBeDefined()
      expect(dbRecipe.name).toBe('Simple Bread')
    })

    it('should update existing recipe successfully', async () => {
      // First create a recipe
      await (prisma as any).recipe.create({
        data: {
          name: 'Original Bread',
          shortName: 'BREAD_RECIPE',
          universe: 'Gor',
          craftingStationType: 'cooking',
          ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
          craftingTime: 20,
          outputItemShortName: 'BREAD',
          outputItemQuantity: 1,
          knowledge: '',
          tool: '',
          license: '',
          category: 'Food',
          tags: 'basic',
          exp: 3
        }
      })

      // Now update it
      const updateData = createApiBody({
        name: 'Updated Bread Recipe',
        shortName: 'BREAD_RECIPE', // Same shortName for upsert
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [
          { quantity: 2, rpItemShortName: 'FLOUR' },
          { quantity: 1, rpItemShortName: 'WATER' }
        ],
        craftingTime: 30,
        outputItemShortName: 'BREAD',
        outputItemQuantity: 2,
        knowledge: '',
        tool: '',
        license: '',
        category: 'Food',
        tags: 'updated,bread',
        exp: 8
      })

      const request = createMockPostRequest('/api/recipes', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.name).toBe('Updated Bread Recipe')
      expect(data.data.craftingTime).toBe(30)
      expect(data.data.outputItemQuantity).toBe(2)
      expect(data.data.exp).toBe(8)

      // Verify update in database
      const dbRecipe = await (prisma as any).recipe.findUnique({
        where: {
          shortName_universe: {
            shortName: 'BREAD_RECIPE',
            universe: 'Gor'
          }
        }
      })
      expect(dbRecipe.name).toBe('Updated Bread Recipe')
      expect(dbRecipe.craftingTime).toBe(30)
    })

    it('should reject recipe with non-existent output item', async () => {
      const recipeData = createApiBody({
        name: 'Invalid Recipe',
        shortName: 'INVALID_RECIPE',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
        craftingTime: 30,
        outputItemShortName: 'NON_EXISTENT_ITEM',
        outputItemQuantity: 1,
        knowledge: '',
        tool: '',
        license: '',
        category: 'Food',
        tags: '',
        exp: 0
      })

      const request = createMockPostRequest('/api/recipes', recipeData)

      await testExpectedError('Non-existent output item', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Output item \'NON_EXISTENT_ITEM\' not found')
        expect(response.status).toBe(400)
      })
    })

    it('should reject recipe with non-existent ingredient item', async () => {
      const recipeData = createApiBody({
        name: 'Invalid Recipe',
        shortName: 'INVALID_RECIPE',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [{ quantity: 1, rpItemShortName: 'NON_EXISTENT_INGREDIENT' }],
        craftingTime: 30,
        outputItemShortName: 'BREAD',
        outputItemQuantity: 1,
        knowledge: '',
        tool: '',
        license: '',
        category: 'Food',
        tags: '',
        exp: 0
      })

      const request = createMockPostRequest('/api/recipes', recipeData)

      await testExpectedError('Non-existent ingredient item', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Ingredient item \'NON_EXISTENT_INGREDIENT\' not found')
        expect(response.status).toBe(400)
      })
    })

    it('should reject recipe with invalid signature', async () => {
      const recipeData = {
        name: 'Test Recipe',
        shortName: 'TEST_RECIPE',
        universe: 'Gor',
        craftingStationType: 'cooking',
        ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
        craftingTime: 30,
        outputItemShortName: 'BREAD',
        outputItemQuantity: 1,
        knowledge: '',
        tool: '',
        license: '',
        category: 'Food',
        tags: '',
        exp: 0,
        timestamp: new Date().toISOString(),
        signature: 'invalid_signature'
      }

      const request = createMockPostRequest('/api/recipes', recipeData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'fails to match the required pattern')
        expect(response.status).toBe(400)
      })
    })

    it('should reject recipe with missing required fields', async () => {
      const recipeData = createApiBody({
        name: 'Test Recipe',
        universe: 'Gor',
        // missing required fields like shortName, craftingStationType, etc.
      })

      const request = createMockPostRequest('/api/recipes', recipeData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })
  })

  describe('GET - Recipe Lists and Categories', () => {
    beforeEach(async () => {
      // Create test user with known recipes
      const user = await createTestUser(TEST_USERS[0])

      // Update user with known recipes
      await prisma.user.update({
        where: { id: user.id },
        data: { knownRecipes: ['ADVANCED_BREAD', 'SECRET_RECIPE'] }
      })

      // Create test items
      await createTestItem({
        name: 'Test Flour',
        shortName: 'FLOUR',
        category: 'Food',
        universe: 'Gor'
      })
      await createTestItem({
        name: 'Test Bread',
        shortName: 'BREAD',
        category: 'Food',
        universe: 'Gor'
      })
      await createTestItem({
        name: 'Test Wine',
        shortName: 'WINE',
        category: 'Drinks',
        universe: 'Gor'
      })

      // Create test recipes
      await (prisma as any).recipe.createMany({
        data: [
          {
            name: 'Simple Bread',
            shortName: 'SIMPLE_BREAD',
            universe: 'Gor',
            craftingStationType: 'cooking',
            ingredients: [{ quantity: 1, rpItemShortName: 'FLOUR' }],
            craftingTime: 30,
            outputItemShortName: 'BREAD',
            outputItemQuantity: 1,
            knowledge: '',
            tool: '',
            license: '',
            category: 'Food',
            tags: 'basic',
            exp: 5
          },
          {
            name: 'Advanced Bread',
            shortName: 'ADVANCED_BREAD',
            universe: 'Gor',
            craftingStationType: 'cooking',
            ingredients: [{ quantity: 2, rpItemShortName: 'FLOUR' }],
            craftingTime: 60,
            outputItemShortName: 'BREAD',
            outputItemQuantity: 2,
            knowledge: 'Advanced Cooking',
            tool: 'Special Oven',
            license: 'Master Baker',
            category: 'Food',
            tags: 'advanced',
            exp: 15
          },
          {
            name: 'Basic Wine',
            shortName: 'BASIC_WINE',
            universe: 'Gor',
            craftingStationType: 'brewing',
            ingredients: [],
            craftingTime: 120,
            outputItemShortName: 'WINE',
            outputItemQuantity: 1,
            knowledge: '',
            tool: '',
            license: '',
            category: 'Drinks',
            tags: 'alcohol',
            exp: 10
          }
        ]
      })
    })

    it('should return crafting categories successfully', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data).toEqual(['Food', 'Drinks', 'Bondmaid Food'])
    })

    it('should return recipes filtered by station type and category', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data).toHaveLength(2) // Simple bread (basic) + Advanced bread (known)

      const recipeNames = data.data.map((r: any) => r.name)
      expect(recipeNames).toContain('Simple Bread')
      expect(recipeNames).toContain('Advanced Bread')
    })

    it('should only return basic recipes for user without known recipes', async () => {
      // Create user without known recipes
      const basicUser = await createTestUser({
        sl_uuid: '550e8400-e29b-41d4-a716-446655440099',
        universe: 'Gor',
        username: 'BasicUser',
        role: 'Free'
      })

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: basicUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(1) // Only simple bread
      expect(data.data[0].name).toBe('Simple Bread')
    })

    it('should return empty array for non-matching station type', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'smithing', // No recipes for this type
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(0)
    })

    it('should reject request with invalid signature', async () => {
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        timestamp: new Date().toISOString(),
        signature: 'invalid_signature'
      })

      await testExpectedError('Invalid signature', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'fails to match the required pattern')
        expect(response.status).toBe(400)
      })
    })

    it('should reject request with missing parameters', async () => {
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        // missing category, sl_uuid, timestamp, signature
      })

      await testExpectedError('Missing required parameters', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Missing required parameters')
        expect(response.status).toBe(400)
      })
    })

    it('should return 404 for non-existent user', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: '550e8400-e29b-41d4-a716-000000000000', // Non-existent UUID
        universe: 'Gor',
        timestamp,
        signature
      })

      await testExpectedError('User not found', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'User not found')
        expect(response.status).toBe(404)
      })
    })

    it('should handle categories request with missing timestamp', async () => {
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        universe: 'Gor',
        // missing timestamp and signature
      })

      await testExpectedError('Missing timestamp and signature', async () => {
        const response = await GET(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'Missing required parameters: timestamp and signature')
        expect(response.status).toBe(400)
      })
    })

    it('should return shortNames only when shortNamesOnly=true', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        shortNamesOnly: 'true',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data).toHaveLength(2) // Simple bread (basic) + Advanced bread (known)

      // Verify data contains only shortName strings, not objects
      expect(data.data).toContain('SIMPLE_BREAD')
      expect(data.data).toContain('ADVANCED_BREAD')

      // Verify no objects are returned
      data.data.forEach((item: any) => {
        expect(typeof item).toBe('string')
      })
    })

    it('should return full recipe objects when shortNamesOnly=false or not specified', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        shortNamesOnly: 'false',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data).toHaveLength(2)

      // Verify data contains full recipe objects
      data.data.forEach((recipe: any) => {
        expect(typeof recipe).toBe('object')
        expect(recipe).toHaveProperty('shortName')
        expect(recipe).toHaveProperty('name')
        expect(recipe).toHaveProperty('ingredients')
        expect(recipe).toHaveProperty('craftingTime')
        expect(recipe).toHaveProperty('outputItemShortName')
        expect(recipe).toHaveProperty('outputItemQuantity')
        expect(recipe).toHaveProperty('category')
        expect(recipe).toHaveProperty('tags')
        expect(recipe).toHaveProperty('exp')
      })
    })

    it('should return empty array for shortNamesOnly when no recipes match', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')
      const request = createMockGetRequest('/api/recipes', {
        craftingStationType: 'smithing', // No recipes for this type
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        shortNamesOnly: 'true',
        timestamp,
        signature
      })

      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data).toHaveLength(0)
      expect(Array.isArray(data.data)).toBe(true)
    })

    it('should accept shortNamesOnly as boolean parameter', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'Gor')

      // Test with boolean true
      const requestTrue = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        shortNamesOnly: true,
        timestamp,
        signature
      })

      const responseTrue = await GET(requestTrue)
      const dataTrue = await parseJsonResponse(responseTrue)

      expectSuccess(dataTrue)
      expect(dataTrue.data).toContain('SIMPLE_BREAD')

      // Test with boolean false
      const requestFalse = createMockGetRequest('/api/recipes', {
        craftingStationType: 'cooking',
        category: 'Food',
        sl_uuid: TEST_USERS[0].sl_uuid,
        universe: 'Gor',
        shortNamesOnly: false,
        timestamp,
        signature
      })

      const responseFalse = await GET(requestFalse)
      const dataFalse = await parseJsonResponse(responseFalse)

      expectSuccess(dataFalse)
      expect(typeof dataFalse.data[0]).toBe('object')
    })
  })
})