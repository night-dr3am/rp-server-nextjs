import { POST } from '../route'
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  expectSuccess,
  expectError,
  generateTestUUID,
  generateTestUsername,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'

describe('POST /api/gor/character/register', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  it('should generate character creation link for new user', async () => {
    // Create test user without gorean stats
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor')

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.alreadyRegistered).toBe("false")
    expect(data.data.characterCreationUrl).toContain('/gor/create/')
    expect(data.data.token).toBeDefined()
    expect(data.data.expiresAt).toBeDefined()
    expect(data.data.user.username).toBe(username)
    expect(data.data.user.uuid).toBe(uuid)
    expect(data.data.user.universe).toBe('gor')
  })

  it('should return existing stats for registered user', async () => {
    // Create test user with gorean stats
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 15,
            hunger: 100,
            thirst: 100,
            goldCoin: 10,
            silverCoin: 50,
            copperCoin: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Tarl of Ko-ro-ba',
            agentName: `${username} Resident`,
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'free_man',
            casteRole: 'warriors',
            casteRoleType: 'highCaste',
            strength: 4,
            agility: 3,
            intellect: 2,
            perception: 3,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 20,
            healthCurrent: 15,
            hungerCurrent: 100,
            thirstCurrent: 100,
            // goldCoin, silverCoin, copperCoin removed - now in UserStats only
            xp: 50,
            registrationCompleted: true
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor')

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.alreadyRegistered).toBe("true")
    expect(data.data.goreanStats.characterName).toBe('Tarl of Ko-ro-ba')
    expect(data.data.goreanStats.species).toBe('human')
    expect(data.data.goreanStats.culture).toBe('southern_cities')
    expect(data.data.goreanStats.socialStatus).toBe('free_man')
    expect(data.data.goreanStats.casteRole).toBe('warriors')
  })

  it('should create user and return character creation link for non-existent user', async () => {
    const uuid = generateTestUUID()
    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor')

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.alreadyRegistered).toBe("false")
    expect(data.data.characterCreationUrl).toBeDefined()
    expect(data.data.token).toBeDefined()
    expect(data.data.user.uuid).toBe(uuid)
    expect(data.data.user.universe).toBe('gor')

    // Verify user was created in database
    const createdUser = await prisma.user.findFirst({
      where: { slUuid: uuid, universe: 'gor' }
    })
    expect(createdUser).toBeTruthy()
  })

  it('should return 401 for invalid signature', async () => {
    const body = {
      sl_uuid: generateTestUUID(),
      universe: 'gor',
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature'
    }

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
  })

  it('should enforce rate limiting', async () => {
    // Create test user
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    const user = await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        }
      }
    })

    // Create 5 tokens to hit rate limit
    const tokens = []
    for (let i = 0; i < 5; i++) {
      tokens.push(
        prisma.profileToken.create({
          data: {
            userId: user.id,
            token: `token-${i}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        })
      )
    }
    await Promise.all(tokens)

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor')

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Rate limit exceeded')
  })

  it('should allow re-registration for incomplete registration', async () => {
    // Create test user with gorean stats but registrationCompleted = false
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Incomplete Character',
            agentName: `${username} Resident`,
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'free_man',
            strength: 3,
            agility: 3,
            intellect: 2,
            perception: 2,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 15,
            registrationCompleted: false  // NOT completed
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor')

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    // Should allow re-registration
    expect(data.data.alreadyRegistered).toBe("false")
    expect(data.data.characterCreationUrl).toContain('/gor/create/')
    expect(data.data.token).toBeDefined()
  })

  it('should return 400 for invalid universe', async () => {
    const body = createApiBody({
      sl_uuid: generateTestUUID(),
      universe: 'arkana'  // Wrong universe
    }, 'arkana')  // Wrong signature too

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
    expect(response.status).toBe(400)
  })

  it('should return 400 for missing sl_uuid', async () => {
    const body = createApiBody({
      // missing sl_uuid
      universe: 'gor'
    }, 'gor')

    const request = createMockPostRequest('/api/gor/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
    expect(response.status).toBe(400)
  })
})
