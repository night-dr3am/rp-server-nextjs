import { GET, POST } from '../route'
import {
  createMockGetRequest,
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
import { generateSignature } from '@/lib/signature'

describe('GET and POST /api/arkana/auth/check', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  describe('GET', () => {
    it('should return user data with Arkana character', async () => {
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

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'arkana')
      const params = {
        sl_uuid: uuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      }

      const request = createMockGetRequest('/api/arkana/auth/check', params)
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.user.slUuid).toBe(uuid)
      expect(data.data.user.universe).toBe('arkana')
      expect(data.data.stats.health).toBe(100)
      expect(data.data.hasArkanaCharacter).toBe("true")
      expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Test Character')
      expect(decodeURIComponent(data.data.arkanaStats.race)).toBe('Human')
      expect(decodeURIComponent(data.data.arkanaStats.archetype)).toBe('Arcanist')
    })

    it('should return 404 for user without completed Arkana registration', async () => {
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
              thirst: 100,
              copperCoin: 10
            }
          }
        }
      })

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'arkana')
      const params = {
        sl_uuid: uuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      }

      const request = createMockGetRequest('/api/arkana/auth/check', params)
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User registration incomplete')
    })

    it('should return 400 for wrong universe', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'gor') // Generate signature for gor universe
      const params = {
        sl_uuid: generateTestUUID(),
        universe: 'gor', // Wrong universe
        timestamp: timestamp,
        signature: signature
      }

      const request = createMockGetRequest('/api/arkana/auth/check', params)
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'This endpoint is only for Arkana universe')
    })

    it('should return 404 for non-existent user', async () => {
      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'arkana')
      const params = {
        sl_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      }

      const request = createMockGetRequest('/api/arkana/auth/check', params)
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found in Arkana universe')
    })

    it('should process activeEffects and liveStats correctly with multiple effects', async () => {
      // Create test user with specific activeEffects and liveStats
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
              thirst: 100,
              copperCoin: 10
            }
          },
          arkanaStats: {
            create: {
              characterName: 'Debuffed Character',
              agentName: `${username} Resident`,
              race: 'human',
              archetype: 'Arcanist',
              physical: 3,
              dexterity: 2,
              mental: 4,
              perception: 3,
              hitPoints: 15,
              statPointsPool: 0,
              statPointsSpent: 6,
              flaws: [],
              flawPointsGranted: 0,
              powerPointsBudget: 15,
              powerPointsBonus: 0,
              powerPointsSpent: 0,
              credits: 1000,
              chips: 500,
              xp: 0,
              registrationCompleted: true,
              // Test with specific activeEffects
              activeEffects: [
                {
                  name: "Mental Debuff -1",
                  duration: "turns:2",
                  effectId: "debuff_mental_minus_1",
                  appliedAt: "2025-10-12T15:10:06.612Z",
                  turnsLeft: 2
                },
                {
                  name: "Entropy Disruption",
                  duration: "turns:1",
                  effectId: "debuff_entropy_disruption",
                  appliedAt: "2025-10-12T15:12:10.572Z",
                  turnsLeft: 1
                }
              ],
              liveStats: {
                Mental: -1,            // debuff_mental_minus_1 (stat_value)
                Mental_rollbonus: -1   // debuff_entropy_disruption (roll_bonus)
              }
            }
          }
        }
      })

      const timestamp = new Date().toISOString()
      const signature = generateSignature(timestamp, 'arkana')
      const params = {
        sl_uuid: uuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      }

      const request = createMockGetRequest('/api/arkana/auth/check', params)
      const response = await GET(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.user.slUuid).toBe(uuid)
      expect(data.data.arkanaStats).toBeDefined()
      expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Debuffed Character')
      // liveStatsString should be URL-encoded with new format including effect names and durations
      const decodedLiveStats = decodeURIComponent(data.data.arkanaStats.liveStatsString)
      // With modifierType distinction, stat_value and roll_bonus are shown separately
      expect(decodedLiveStats).toContain('Mental -1')
      expect(decodedLiveStats).toContain('Mental Roll Bonus -1')
      expect(decodedLiveStats).toContain('Mental Debuff -1')
      expect(decodedLiveStats).toContain('2 turns left')
      expect(decodedLiveStats).toContain('Entropy Disruption')
      expect(decodedLiveStats).toContain('1 turn left')
    })
  })

  describe('POST', () => {
    it('should return user data with Arkana character', async () => {
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

      const request = createMockPostRequest('/api/arkana/auth/check', body)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.user.slUuid).toBe(uuid)
      expect(data.data.user.universe).toBe('arkana')
      expect(data.data.stats.health).toBe(100)
      expect(data.data.hasArkanaCharacter).toBe("true")
      expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Test Character')
    })

    it('should return 400 for wrong universe in POST', async () => {
      const body = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'gor' // Wrong universe
      }, 'gor')

      const request = createMockPostRequest('/api/arkana/auth/check', body)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'This endpoint is only for Arkana universe')
    })

    it('should return 404 for user without completed Arkana registration in POST', async () => {
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
              thirst: 100,
              copperCoin: 10
            }
          }
        }
      })

      const body = createApiBody({
        sl_uuid: uuid,
        universe: 'arkana'
      }, 'arkana')

      const request = createMockPostRequest('/api/arkana/auth/check', body)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User registration incomplete')
    })

    it('should return 404 for non-existent user in POST', async () => {
      const body = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'arkana'
      }, 'arkana')

      const request = createMockPostRequest('/api/arkana/auth/check', body)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectError(data, 'User not found in Arkana universe')
    })

    it('should process activeEffects and liveStats correctly with multiple effects in POST', async () => {
      // Create test user with specific activeEffects and liveStats
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
              thirst: 100,
              copperCoin: 10
            }
          },
          arkanaStats: {
            create: {
              characterName: 'Debuffed Character',
              agentName: `${username} Resident`,
              race: 'human',
              archetype: 'Arcanist',
              physical: 3,
              dexterity: 2,
              mental: 4,
              perception: 3,
              hitPoints: 15,
              statPointsPool: 0,
              statPointsSpent: 6,
              flaws: [],
              flawPointsGranted: 0,
              powerPointsBudget: 15,
              powerPointsBonus: 0,
              powerPointsSpent: 0,
              credits: 1000,
              chips: 500,
              xp: 0,
              registrationCompleted: true,
              // Test with specific activeEffects
              activeEffects: [
                {
                  name: "Mental Debuff -1",
                  duration: "turns:2",
                  effectId: "debuff_mental_minus_1",
                  appliedAt: "2025-10-12T15:10:06.612Z",
                  turnsLeft: 2
                },
                {
                  name: "Entropy Disruption",
                  duration: "turns:1",
                  effectId: "debuff_entropy_disruption",
                  appliedAt: "2025-10-12T15:12:10.572Z",
                  turnsLeft: 1
                }
              ],
              liveStats: {
                Mental: -1,            // debuff_mental_minus_1 (stat_value)
                Mental_rollbonus: -1   // debuff_entropy_disruption (roll_bonus)
              }
            }
          }
        }
      })

      const body = createApiBody({
        sl_uuid: uuid,
        universe: 'arkana'
      }, 'arkana')

      const request = createMockPostRequest('/api/arkana/auth/check', body)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.user.slUuid).toBe(uuid)
      expect(data.data.arkanaStats).toBeDefined()
      expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Debuffed Character')
      // liveStatsString should be URL-encoded with new format including effect names and durations
      const decodedLiveStats = decodeURIComponent(data.data.arkanaStats.liveStatsString)
      // With modifierType distinction, stat_value and roll_bonus are shown separately
      expect(decodedLiveStats).toContain('Mental -1')
      expect(decodedLiveStats).toContain('Mental Roll Bonus -1')
      expect(decodedLiveStats).toContain('Mental Debuff -1')
      expect(decodedLiveStats).toContain('2 turns left')
      expect(decodedLiveStats).toContain('Entropy Disruption')
      expect(decodedLiveStats).toContain('1 turn left')
    })
  })
})