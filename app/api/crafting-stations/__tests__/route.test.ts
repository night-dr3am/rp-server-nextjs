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
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'

describe('/api/crafting-stations', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  describe('POST - Crafting Station Upsert', () => {
    it('should create new crafting station successfully', async () => {
      const stationData = createApiBody({
        stationId: 'test-cooking-station-001',
        universe: 'Gor',
        name: 'Test Cooking Fire',
        type: 'cooking'
      })

      const request = createMockPostRequest('/api/crafting-stations', stationData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(response.status).toBe(200)
      expect(data.data.stationId).toBe('test-cooking-station-001')
      expect(data.data.name).toBe('Test Cooking Fire')
      expect(data.data.type).toBe('cooking')
      expect(data.data.universe).toBe('Gor')
      expect(data.data.busy).toBe(false)

      // Verify station was created in database
      const dbStation = await (prisma as any).craftingStation.findUnique({
        where: {
          stationId_universe: {
            stationId: 'test-cooking-station-001',
            universe: 'Gor'
          }
        }
      })
      expect(dbStation).toBeDefined()
      expect(dbStation.name).toBe('Test Cooking Fire')
      expect(dbStation.type).toBe('cooking')
      expect(dbStation.busy).toBe(false)
    })

    it('should update existing crafting station successfully', async () => {
      // First create a station
      await (prisma as any).craftingStation.create({
        data: {
          stationId: 'test-station-update',
          universe: 'Gor',
          name: 'Original Name',
          type: 'cooking',
          busy: false
        }
      })

      // Now update it
      const updateData = createApiBody({
        stationId: 'test-station-update', // Same stationId for upsert
        universe: 'Gor',
        name: 'Updated Cooking Station',
        type: 'alchemy' // Changed type
      })

      const request = createMockPostRequest('/api/crafting-stations', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.name).toBe('Updated Cooking Station')
      expect(data.data.type).toBe('alchemy')
      expect(data.data.stationId).toBe('test-station-update')

      // Verify update in database
      const dbStation = await (prisma as any).craftingStation.findUnique({
        where: {
          stationId_universe: {
            stationId: 'test-station-update',
            universe: 'Gor'
          }
        }
      })
      expect(dbStation.name).toBe('Updated Cooking Station')
      expect(dbStation.type).toBe('alchemy')
    })

    it('should handle different station types', async () => {
      const stationTypes = ['cooking', 'alchemy', 'smithing', 'brewing', 'tailoring']

      for (const type of stationTypes) {
        const stationData = createApiBody({
          stationId: `test-${type}-station`,
          universe: 'Gor',
          name: `Test ${type.charAt(0).toUpperCase() + type.slice(1)} Station`,
          type
        })

        const request = createMockPostRequest('/api/crafting-stations', stationData)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.type).toBe(type)
        expect(data.data.name).toContain(type.charAt(0).toUpperCase() + type.slice(1))
      }
    })

    it('should handle different universes', async () => {
      const universes = ['Gor', 'arkana']

      for (const universe of universes) {
        const stationData = createApiBody({
          stationId: 'test-station',
          universe,
          name: `Test Station for ${universe}`,
          type: 'cooking'
        }, universe)

        const request = createMockPostRequest('/api/crafting-stations', stationData)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.universe).toBe(universe)
        expect(data.data.name).toContain(universe)
      }
    })

    it('should allow same stationId in different universes', async () => {
      const stationId = 'multi-universe-station'

      // Create station in Gor
      const gorStationData = createApiBody({
        stationId,
        universe: 'Gor',
        name: 'Gor Cooking Station',
        type: 'cooking'
      }, 'Gor')

      const gorRequest = createMockPostRequest('/api/crafting-stations', gorStationData)
      const gorResponse = await POST(gorRequest)
      const gorData = await parseJsonResponse(gorResponse)

      expectSuccess(gorData)

      // Create station with same stationId in arkana
      const arkanaStationData = createApiBody({
        stationId,
        universe: 'arkana',
        name: 'Arkana Cooking Station',
        type: 'cooking'
      }, 'arkana')

      const arkanaRequest = createMockPostRequest('/api/crafting-stations', arkanaStationData)
      const arkanaResponse = await POST(arkanaRequest)
      const arkanaData = await parseJsonResponse(arkanaResponse)

      expectSuccess(arkanaData)

      // Verify both stations exist in database
      const gorStation = await (prisma as any).craftingStation.findUnique({
        where: {
          stationId_universe: {
            stationId,
            universe: 'Gor'
          }
        }
      })
      const arkanaStation = await (prisma as any).craftingStation.findUnique({
        where: {
          stationId_universe: {
            stationId,
            universe: 'arkana'
          }
        }
      })

      expect(gorStation).toBeDefined()
      expect(arkanaStation).toBeDefined()
      expect(gorStation.name).toBe('Gor Cooking Station')
      expect(arkanaStation.name).toBe('Arkana Cooking Station')
    })

    it('should preserve busy status when updating existing station', async () => {
      // Create station and mark as busy
      const initialStation = await (prisma as any).craftingStation.create({
        data: {
          stationId: 'busy-station',
          universe: 'Gor',
          name: 'Busy Station',
          type: 'cooking',
          busy: true
        }
      })

      // Update the station
      const updateData = createApiBody({
        stationId: 'busy-station',
        universe: 'Gor',
        name: 'Updated Busy Station',
        type: 'alchemy'
      })

      const request = createMockPostRequest('/api/crafting-stations', updateData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)

      // Verify busy status is preserved
      const updatedStation = await (prisma as any).craftingStation.findUnique({
        where: { id: initialStation.id }
      })
      expect(updatedStation.busy).toBe(true) // Should remain busy
      expect(updatedStation.name).toBe('Updated Busy Station')
      expect(updatedStation.type).toBe('alchemy')
    })

    it('should reject station with invalid signature', async () => {
      const stationData = {
        stationId: 'test-station',
        universe: 'Gor',
        name: 'Test Station',
        type: 'cooking',
        timestamp: new Date().toISOString(),
        signature: 'invalid_signature'
      }

      const request = createMockPostRequest('/api/crafting-stations', stationData)

      await testExpectedError('Invalid signature', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data, 'fails to match the required pattern')
        expect(response.status).toBe(400)
      })
    })

    it('should reject station with missing required fields', async () => {
      const stationData = createApiBody({
        stationId: 'test-station',
        universe: 'Gor',
        // missing name and type
      })

      const request = createMockPostRequest('/api/crafting-stations', stationData)

      await testExpectedError('Missing required fields', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject station with invalid stationId format', async () => {
      const stationData = createApiBody({
        stationId: '', // Empty stationId
        universe: 'Gor',
        name: 'Test Station',
        type: 'cooking'
      })

      const request = createMockPostRequest('/api/crafting-stations', stationData)

      await testExpectedError('Invalid stationId', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should accept station with any universe string (arkana)', async () => {
      const stationData = createApiBody({
        stationId: 'test-station',
        universe: 'arkana',
        name: 'Test Station',
        type: 'cooking'
      }, 'arkana')

      const request = createMockPostRequest('/api/crafting-stations', stationData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.universe).toBe('arkana')
    })

    it('should reject station with empty name', async () => {
      const stationData = createApiBody({
        stationId: 'test-station',
        universe: 'Gor',
        name: '', // Empty name
        type: 'cooking'
      })

      const request = createMockPostRequest('/api/crafting-stations', stationData)

      await testExpectedError('Empty name', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should reject station with empty type', async () => {
      const stationData = createApiBody({
        stationId: 'test-station',
        universe: 'Gor',
        name: 'Test Station',
        type: '' // Empty type
      })

      const request = createMockPostRequest('/api/crafting-stations', stationData)

      await testExpectedError('Empty type', async () => {
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    it('should handle very long station names', async () => {
      const longName = 'A'.repeat(255) // Max length name
      const stationData = createApiBody({
        stationId: 'long-name-station',
        universe: 'Gor',
        name: longName,
        type: 'cooking'
      })

      const request = createMockPostRequest('/api/crafting-stations', stationData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.name).toBe(longName)
    })

    it('should handle station IDs with special characters', async () => {
      const specialStationId = 'station-with-dashes_and_underscores.and.dots'
      const stationData = createApiBody({
        stationId: specialStationId,
        universe: 'Gor',
        name: 'Special Station',
        type: 'cooking'
      })

      const request = createMockPostRequest('/api/crafting-stations', stationData)
      const response = await POST(request)
      const data = await parseJsonResponse(response)

      expectSuccess(data)
      expect(data.data.stationId).toBe(specialStationId)

      // Verify in database
      const dbStation = await (prisma as any).craftingStation.findUnique({
        where: {
          stationId_universe: {
            stationId: specialStationId,
            universe: 'Gor'
          }
        }
      })
      expect(dbStation).toBeDefined()
    })

    it('should create multiple stations successfully', async () => {
      const stations = [
        { stationId: 'cooking-1', name: 'Cooking Fire 1', type: 'cooking' },
        { stationId: 'cooking-2', name: 'Cooking Fire 2', type: 'cooking' },
        { stationId: 'alchemy-1', name: 'Alchemy Lab 1', type: 'alchemy' },
        { stationId: 'smithing-1', name: 'Forge 1', type: 'smithing' },
      ]

      for (const station of stations) {
        const stationData = createApiBody({
          stationId: station.stationId,
          universe: 'Gor',
          name: station.name,
          type: station.type
        })

        const request = createMockPostRequest('/api/crafting-stations', stationData)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.stationId).toBe(station.stationId)
        expect(data.data.name).toBe(station.name)
        expect(data.data.type).toBe(station.type)
      }

      // Verify all stations exist in database
      const allStations = await (prisma as any).craftingStation.findMany({
        where: { universe: 'Gor' }
      })
      expect(allStations).toHaveLength(4)
    })
  })
})