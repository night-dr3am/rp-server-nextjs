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

describe('POST /api/arkana/character/register', () => {
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
    // Create test user without arkana stats
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'arkana',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 100,
            hunger: 100,
            thirst: 100
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.alreadyRegistered).toBe(false)
    expect(data.data.characterCreationUrl).toContain('/arkana/create/')
    expect(data.data.token).toBeDefined()
    expect(data.data.expiresAt).toBeDefined()
    expect(data.data.user.username).toBe(username)
    expect(data.data.user.uuid).toBe(uuid)
    expect(data.data.user.universe).toBe('arkana')
  })

  it('should return existing stats for registered user', async () => {
    // Create test user with arkana stats
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'arkana',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 100,
            hunger: 100,
            thirst: 100
          }
        },
        arkanaStats: {
          create: {
            characterName: 'Test Character',
            agentName: `${username} Resident`,
            race: 'Human',
            archetype: 'Arcanist',
            physical: 3,
            dexterity: 3,
            mental: 4,
            perception: 2,
            hitPoints: 15,
            statPointsPool: 2,
            statPointsSpent: 8,
            inherentPowers: ['Magic Sense'],
            weaknesses: ['Mortal'],
            flaws: [],
            flawPointsGranted: 0,
            powerPointsBudget: 15,
            powerPointsBonus: 0,
            powerPointsSpent: 0,
            commonPowers: [],
            archetypePowers: [],
            perks: [],
            magicSchools: [],
            magicWeaves: [],
            cybernetics: [],
            cyberneticAugments: [],
            registrationCompleted: true
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.alreadyRegistered).toBe(true)
    expect(data.data.arkanaStats.characterName).toBe('Test Character')
    expect(data.data.arkanaStats.race).toBe('Human')
    expect(data.data.arkanaStats.archetype).toBe('Arcanist')
  })

  it('should create user and return character creation link for non-existent user', async () => {
    const uuid = generateTestUUID()
    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.alreadyRegistered).toBe(false)
    expect(data.data.characterCreationUrl).toBeDefined()
    expect(data.data.token).toBeDefined()
    expect(data.data.user.uuid).toBe(uuid)
    expect(data.data.user.universe).toBe('arkana')

    // Verify user was created in database
    const createdUser = await prisma.user.findFirst({
      where: { slUuid: uuid, universe: 'arkana' }
    })
    expect(createdUser).toBeTruthy()
  })

  it('should return 401 for invalid signature', async () => {
    const body = {
      sl_uuid: generateTestUUID(),
      universe: 'arkana',
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature'
    }

    const request = createMockPostRequest('/api/arkana/character/register', body)
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
        universe: 'arkana',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 100,
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
      universe: 'arkana'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/character/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Rate limit exceeded')
  })
})