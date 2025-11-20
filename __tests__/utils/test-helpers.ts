import { createRequest, createResponse } from 'node-mocks-http'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildApiUrl, getTestConfig } from './test-config'
import { generateSignature, generateTimestamp, generateUnixSignature } from '@/lib/signature'

export interface TestUser {
  sl_uuid: string
  universe: string
  username: string
  role: 'Free' | 'Slave' | 'Jarl' | 'Bondmaid' | 'Panther' | 'Outlaw'
}

export interface TestItem {
  name: string
  shortName: string
  universe?: string
  category: string
  hungerValue?: number
  thirstValue?: number
  healthValue?: number
  edible?: boolean
  drinkable?: boolean
  priceGold?: number
  priceSilver?: number
  priceCopper?: number
}

// Standard test users for consistent testing
export const TEST_USERS: TestUser[] = [
  {
    sl_uuid: '550e8400-e29b-41d4-a716-446655440010',
    universe: 'Gor',
    username: 'TestUser1',
    role: 'Free',
  },
  {
    sl_uuid: '550e8400-e29b-41d4-a716-446655440011',
    universe: 'Gor',
    username: 'TestUser2',
    role: 'Jarl',
  },
  {
    sl_uuid: '550e8400-e29b-41d4-a716-446655440012',
    universe: 'Gor',
    username: 'TestUser3',
    role: 'Slave',
  },
]

// Arkana test users
export const ARKANA_TEST_USERS: TestUser[] = [
  {
    sl_uuid: '550e8400-e29b-41d4-a716-446655440020',
    universe: 'arkana',
    username: 'ArkanaTestUser1',
    role: 'Free',
  },
  {
    sl_uuid: '550e8400-e29b-41d4-a716-446655440021',
    universe: 'arkana',
    username: 'ArkanaTestUser2',
    role: 'Free',
  },
  {
    sl_uuid: '550e8400-e29b-41d4-a716-446655440022',
    universe: 'arkana',
    username: 'ArkanaTestUser3',
    role: 'Free',
  },
]

// Standard test items
export const TEST_ITEMS: TestItem[] = [
  {
    name: 'Test Bread',
    shortName: 'TEST_BREAD',
    category: 'Food',
    hungerValue: 15,
    thirstValue: 0,
    healthValue: 0,
    edible: true,
    drinkable: false,
    priceGold: 0,
    priceSilver: 0,
    priceCopper: 2,
  },
  {
    name: 'Test Water',
    shortName: 'TEST_WATER',
    category: 'Drinks',
    hungerValue: 0,
    thirstValue: 20,
    healthValue: 0,
    edible: false,
    drinkable: true,
    priceGold: 0,
    priceSilver: 0,
    priceCopper: 1,
  },
]

/**
 * Create mock NextRequest for testing
 * @param method HTTP method
 * @param body Request body (for non-GET requests)
 * @param path Optional API path (defaults to /api/test)
 * @param searchParams Optional query parameters
 */
export function createMockRequest(
  method: string, 
  body: any = {}, 
  path: string = '/api/test',
  searchParams?: Record<string, string>
): NextRequest {
  let url = buildApiUrl(path)
  
  if (searchParams) {
    const params = new URLSearchParams(searchParams)
    url = `${url}?${params.toString()}`
  }

  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
    },
  }

  if (method !== 'GET' && body) {
    init.body = JSON.stringify(body)
  }

  return new NextRequest(url, init)
}

/**
 * Create GET request with query parameters
 */
export function createMockGetRequest(path: string, searchParams: Record<string, string>): NextRequest {
  return createMockRequest('GET', {}, path, searchParams)
}

/**
 * Create POST request with body
 */
export function createMockPostRequest(path: string, body: any): NextRequest {
  return createMockRequest('POST', body, path)
}

/**
 * Create PUT request with body
 */
export function createMockPutRequest(path: string, body: any): NextRequest {
  return createMockRequest('PUT', body, path)
}

// Create API request body with timestamp and signature
export function createApiBody(data: any, universe: string = 'Gor'): any {
  const timestamp = generateTimestamp();
  const signature = generateSignature(timestamp, universe);

  return {
    ...data,
    timestamp,
    signature,
  }
}

// Create API request body with custom timestamp for testing time-based scenarios
export function createApiBodyWithTimestamp(data: any, timestamp: string, universe: string = 'Gor'): any {
  const signature = generateSignature(timestamp, universe);

  return {
    ...data,
    timestamp,
    signature,
  }
}

// Generate Unix timestamp (for arkana endpoints)
export function generateUnixTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// Create API request body with Unix timestamp and signature (for arkana endpoints)
export function createArkanaApiBody(data: any): any {
  const timestamp = generateUnixTimestamp();
  const signature = generateUnixSignature(timestamp, 'arkana');

  return {
    ...data,
    timestamp,
    signature,
    universe: 'arkana',
  }
}

// Create arkana API request body with custom Unix timestamp for testing time-based scenarios
export function createArkanaApiBodyWithTimestamp(data: any, unixTimestamp: string): any {
  const signature = generateUnixSignature(unixTimestamp, 'arkana');

  return {
    ...data,
    timestamp: unixTimestamp,
    signature,
    universe: 'arkana',
  }
}

// Database cleanup utilities
export async function cleanupDatabase(): Promise<void> {
  // Delete in order to respect foreign key constraints
  try {
    await prisma.event.deleteMany()
    await (prisma as any).crafting.deleteMany()
    await (prisma as any).craftingStation.deleteMany()
    await (prisma as any).recipe.deleteMany()
    await prisma.userInventory.deleteMany()
    await prisma.rpItem.deleteMany()
    await prisma.profileToken.deleteMany()
    await prisma.worldObject.deleteMany()
    await prisma.estate.deleteMany()
    await prisma.nPCTask.deleteMany()
    await prisma.nPC.deleteMany()
    await prisma.arkanaStats.deleteMany()
    await prisma.goreanStats.deleteMany()
    await prisma.userStats.deleteMany()
    await prisma.user.deleteMany()
    // Clean game data tables to prevent cache/DB mismatch
    await prisma.arkanaData.deleteMany()
    await prisma.goreanData.deleteMany()
  } catch (error) {
    // Handle any cleanup errors gracefully
    console.warn('Database cleanup warning:', error)
  }

  // Invalidate data loader caches to ensure tests load from JSON files
  const { invalidateArkanaCache } = await import('@/lib/arkana/dataLoader')
  const { invalidateGorCache } = await import('@/lib/gor/unifiedDataLoader')
  invalidateArkanaCache()
  invalidateGorCache()
}

// Alias for the new schema structure - NPC tests need this
export const cleanupTestData = cleanupDatabase;

// Create test signature for API testing
export function createTestSignature(timestamp: string, universe: string = 'Gor'): string {
  const { generateSignature } = require('../../lib/signature');
  return generateSignature(timestamp, universe);
}

// Simple test user creation for NPC tests
export async function createSimpleTestUser() {
  const uuid = '550e8400-e29b-41d4-a716-' + Math.random().toString(16).substring(2, 14);
  const username = 'TestUser_' + Math.random().toString(36).substring(2, 8);

  return await prisma.user.create({
    data: {
      slUuid: uuid,
      username: username,
      role: 'FREE',
      universe: 'Gor',
      stats: {
        create: {
          health: 100,
          hunger: 100,
          thirst: 100,
          goldCoin: 10,
          silverCoin: 50,
          copperCoin: 1000
        }
      }
    },
    include: {
      stats: true
    }
  });
}

// Create test user in database - overloaded to support both signatures
export async function createTestUser(universe: string): Promise<{ user: any, token: string, testUser: TestUser }>;
export async function createTestUser(testUser: TestUser): Promise<any>;
export async function createTestUser(universeOrTestUser: string | TestUser) {
  // Handle new signature for Arkana tests
  if (typeof universeOrTestUser === 'string') {
    const universe = universeOrTestUser;

    // Generate proper UUID
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    const testUser = {
      sl_uuid: generateUUID(),
      universe,
      username: 'TestUser' + Date.now(),
      role: 'Free' as const
    };

    const user = await prisma.user.create({
      data: {
        slUuid: testUser.sl_uuid,
        universe: testUser.universe,
        username: testUser.username,
        role: testUser.role.toUpperCase() as any,
        stats: universe === 'Gor' ? {
          create: {
            health: 100,
            hunger: 100,
            thirst: 100,
            goldCoin: 10,
            silverCoin: 50,
            copperCoin: 100,
          }
        } : undefined
      }
    });

    // Generate token for profile access
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'test_jwt_secret_for_testing_only';

    const sessionId = `${universe}_test_${user.id}_${Date.now()}`;
    const token = jwt.sign(
      {
        sub: user.slUuid,
        universe: universe,
        purpose: universe === 'arkana' ? 'arkana_character_creation' : 'profile_access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
        jti: sessionId
      },
      jwtSecret
    );

    const profileToken = await prisma.profileToken.create({
      data: {
        userId: user.id,
        token: token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        sessionId: null // Don't set sessionId initially - let the first request associate it
      }
    });

    return { user, token, testUser };
  }

  // Handle original signature for existing tests
  const testUser = universeOrTestUser;
  return await prisma.user.create({
    data: {
      slUuid: testUser.sl_uuid,
      universe: testUser.universe || 'Gor',
      username: testUser.username,
      role: testUser.role.toUpperCase() as any, // Convert to uppercase for database enum
      stats: {
        create: {
          health: 100,
          hunger: 100,
          thirst: 100,
          goldCoin: 10,
          silverCoin: 50,
          copperCoin: 100,
        },
      },
    },
    include: {
      stats: true,
    },
  });
}

// Create test item in database
export async function createTestItem(testItem: TestItem, universe: string = 'Gor') {
  return await prisma.rpItem.create({
    data: {
      name: testItem.name,
      shortName: testItem.shortName,
      universe: testItem.universe || universe,
      category: testItem.category,
      hungerValue: testItem.hungerValue || 0,
      thirstValue: testItem.thirstValue || 0,
      healthValue: testItem.healthValue || 0,
      edible: testItem.edible || false,
      drinkable: testItem.drinkable || false,
      priceGold: testItem.priceGold || 0,
      priceSilver: testItem.priceSilver || 0,
      priceCopper: testItem.priceCopper || 0,
    },
  })
}

// Create test user with inventory items
export async function createTestUserWithInventory(testUser: TestUser, items: TestItem[] = []) {
  const user = await createTestUser(testUser)

  for (const item of items) {
    const createdItem = await createTestItem(item, testUser.universe)
    // Add to user inventory
    await (prisma as any).userInventory.create({
      data: {
        userId: user.id,
        rpItemId: createdItem.id,
        quantity: 1,
        useCount: 0,
        priceGold: item.priceGold || 0,
        priceSilver: item.priceSilver || 0,
        priceCopper: item.priceCopper || 0,
      }
    })
  }

  return user
}

// Create test user with complete Gorean character registration
export async function createTestUserWithGoreanStats(testUser: TestUser) {
  const user = await prisma.user.create({
    data: {
      slUuid: testUser.sl_uuid,
      universe: testUser.universe,
      username: testUser.username,
      role: testUser.role.toUpperCase() as any,
      stats: {
        create: {
          health: 100,
          hunger: 100,
          thirst: 100,
          goldCoin: 10,
          silverCoin: 50,
          copperCoin: 100,
        },
      },
      goreanStats: {
        create: {
          // Identity
          characterName: testUser.username + " Character",
          agentName: testUser.username,
          title: "Test Character",
          background: "Test background for character",

          // Taxonomy
          species: "human",
          speciesCategory: "sapient",
          speciesVariant: null,
          culture: "ko_ro_ba",
          cultureType: "cityState",
          socialStatus: "freeMan",
          statusSubtype: null,
          casteRole: "warrior",
          casteRoleType: "highCaste",
          region: "Ko-ro-ba",
          homeStoneName: "Ko-ro-ba",

          // Base Stats (5 stats, 10 points allocated)
          strength: 3,
          agility: 2,
          intellect: 2,
          perception: 2,
          charisma: 1,
          statPointsPool: 10,
          statPointsSpent: 10,

          // Derived Stats
          healthMax: 15, // strength * 5
          hungerMax: 100,
          thirstMax: 100,

          // Current State
          healthCurrent: 15,
          hungerCurrent: 100,
          thirstCurrent: 100,

          // Economy (coins removed - now in UserStats only)
          xp: 0,

          // Skills (sample)
          skills: [
            { skill_id: "skill_sword", skill_name: "Sword Combat", level: 1 }
          ],
          skillsAllocatedPoints: 5,
          skillsSpentPoints: 3,

          // Abilities (sample)
          abilities: [
            { ability_id: "tactical_command", ability_name: "Tactical Command" }
          ],
          abilitiesAllocatedPoints: 7,
          abilitiesSpentPoints: 2,

          // Active Effects & Live Stats
          activeEffects: [],
          liveStats: {},

          // Metadata
          registrationCompleted: true,
          gorRole: "player",
        },
      },
    },
    include: {
      stats: true,
      goreanStats: true,
    },
  });

  return user;
}

// Generate unique UUIDs for testing
export function generateTestUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate unique usernames for testing
export function generateTestUsername(): string {
  return 'TestUser_' + Math.random().toString(36).substring(2, 8)
}

// Wait for database operation to complete
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Type-safe API response interface
 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Assert helpers for better test readability with type safety
 */
export function expectSuccess<T = any>(response: ApiResponse<T>): void {
  expect(response.success).toBe(true)
  expect(response.error).toBeUndefined()
  expect(response.data).toBeDefined()
}

export function expectError(response: ApiResponse, expectedError?: string): void {
  expect(response.success).toBe(false)
  expect(response.error).toBeDefined()
  if (expectedError) {
    expect(response.error).toContain(expectedError)
  }
}

/**
 * Assert successful response and return typed data
 */
export function expectSuccessWithData<T>(response: ApiResponse<T>): T {
  expectSuccess(response)
  return response.data as T
}

/**
 * Parse JSON response from NextResponse
 */
export async function parseJsonResponse<T = any>(response: Response): Promise<ApiResponse<T>> {
  return await response.json() as ApiResponse<T>
}

// Database transaction wrapper for test isolation
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    return await fn()
  })
}

/**
 * Wrapper for tests that are expected to generate errors
 * Makes it clear in test output that errors are intentional
 */
export async function testExpectedError(
  errorDescription: string,
  testFn: () => Promise<void>
): Promise<void> {
  console.log(`⚠️  Testing expected error: ${errorDescription}`)
  console.log('   (Any errors logged below are expected and part of test validation)')
  await testFn()
  console.log(`✅ Expected error test completed successfully: ${errorDescription}`)
}

export function createArkanaCharacterPayload(overrides: any = {}) {
  return {
    characterName: 'Test Character',
    agentName: 'TestAgent',
    aliasCallsign: 'TC001',
    faction: 'Corporate',
    conceptRole: 'Data Runner',
    job: 'Network Specialist',
    background: 'Grew up in the sprawl',
    race: 'human',
    subrace: '',
    archetype: 'Arcanist',
    physical: 2,
    dexterity: 3,
    mental: 3,
    perception: 2,
    inherentPowers: [],
    weaknesses: [],
    flaws: [],
    commonPowers: [],
    archetypePowers: [],
    perks: [],
    magicSchools: [],
    magicWeaves: [],
    cybernetics: [],
    cyberneticAugments: [],
    picks: [],
    cyberSlots: 0,
    freeMagicSchool: '',
    freeMagicWeave: '',
    synthralFreeWeave: '',
    token: '',
    universe: 'arkana',
    ...overrides
  };
}