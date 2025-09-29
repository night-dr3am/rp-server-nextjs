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

describe('POST /api/arkana/users/profile', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  it('should update character name successfully', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    // Create test user with arkana stats
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
            thirst: 100,
            copperCoin: 10
          }
        },
        arkanaStats: {
          create: {
            characterName: 'Old Character Name',
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
            cyberneticAugments: []
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      update_type: 'name',
      update_value: 'New Character Name'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Character name updated successfully')
    expect(data.data.characterName).toBe('New Character Name')
    expect(data.data.update_type).toBe('name')
    expect(data.data.update_value).toBe('New Character Name')
    expect(data.data.hasArkanaCharacter).toBe(true)
    expect(data.data.arkanaStats.characterName).toBe('New Character Name')
    expect(data.data.arkanaStats.physical).toBe(3)
    expect(data.data.arkanaStats.race).toBe('Human')
  })

  it('should update role successfully', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    // Create test user with arkana stats
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
            thirst: 100,
            copperCoin: 10
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
            hitPoints: 15
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      update_type: 'role',
      update_value: 'Jarl'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Role updated successfully')
    expect(data.data.role).toBe('JARL')
    expect(data.data.characterName).toBe('Test Character')
    expect(data.data.arkanaStats.characterName).toBe('Test Character')
  })

  it('should update title successfully', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    // Create test user with arkana stats
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
            thirst: 100,
            copperCoin: 10
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
            hitPoints: 15
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      update_type: 'title',
      update_value: 'Elite Agent'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Title updated successfully')
    expect(data.data.title).toBe('Elite Agent')
    expect(data.data.characterName).toBe('Test Character')
    expect(data.data.arkanaStats.characterName).toBe('Test Character')
  })

  it('should clear title when update_value is empty', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    // Create test user with existing title
    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'arkana',
        username: username,
        role: 'FREE',
        title: 'Old Title',
        stats: {
          create: {
            health: 100,
            hunger: 100,
            thirst: 100,
            copperCoin: 10
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
            hitPoints: 15
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      update_type: 'title',
      update_value: ''
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Title cleared successfully')
    expect(data.data.title).toBeNull()
  })

  it('should update title color successfully', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    // Create test user with arkana stats
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
            thirst: 100,
            copperCoin: 10
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
            hitPoints: 15
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      update_type: 'titleColor',
      update_value: '<1, 0, 0>'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Title color updated successfully')
    expect(data.data.titleColor).toBe('<1, 0, 0>')
    expect(data.data.characterName).toBe('Test Character')
  })

  it('should return 400 for wrong universe', async () => {
    const body = createApiBody({
      sl_uuid: generateTestUUID(),
      universe: 'gor', // Wrong universe
      update_type: 'name',
      update_value: 'Test Name'
    }, 'gor')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'This endpoint is only for Arkana universe')
  })

  it('should return 404 for non-existent user', async () => {
    const body = createApiBody({
      sl_uuid: generateTestUUID(),
      universe: 'arkana',
      update_type: 'name',
      update_value: 'Test Name'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'User not found in Arkana universe')
  })

  it('should return 404 for user without Arkana character', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    // Create user without arkana stats
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
            thirst: 100,
            copperCoin: 10
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      update_type: 'name',
      update_value: 'Test Name'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'User has no Arkana character')
  })

  it('should return 401 for invalid signature', async () => {
    const body = {
      sl_uuid: generateTestUUID(),
      universe: 'arkana',
      update_type: 'name',
      update_value: 'Test Name',
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature'
    }

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
  })

  it('should return 400 for invalid update type', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    // Create test user with arkana stats
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
            thirst: 100,
            copperCoin: 10
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
            hitPoints: 15
          }
        }
      }
    })

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      update_type: 'invalid_type',
      update_value: 'Test Value'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
  })

  it('should return 400 for invalid input', async () => {
    const body = {
      sl_uuid: 'invalid-uuid',
      universe: 'arkana',
      update_type: 'name',
      update_value: '',
      timestamp: 'invalid-timestamp',
      signature: 'signature'
    }

    const request = createMockPostRequest('/api/arkana/users/profile', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
    expect(data.error).toContain('must be a valid GUID')
  })
})