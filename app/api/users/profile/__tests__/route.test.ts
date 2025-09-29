import { POST } from '../route'
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  TEST_USERS,
  expectSuccess,
  expectError,
  generateTestUUID,
  parseJsonResponse,
  createTestUser,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'
import { prisma } from '@/lib/prisma'
import { User, UserStats } from '@prisma/client'

type UserWithStats = User & { stats?: UserStats | null }

describe('/api/users/profile', () => {
  let existingUser: UserWithStats

  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
    // Create a test user for update tests
    existingUser = await createTestUser(TEST_USERS[0])
  })

  describe('POST - Update Profile', () => {
    describe('Name Updates', () => {
      it('should update username successfully', async () => {
        const newName = 'UpdatedTestName'
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'name',
          update_value: newName,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data).toBeDefined()
        expect(data.data.username).toBe(newName)
        expect(data.data.role).toBe(existingUser.role)
        expect(data.data.update_type).toBe('name')
        expect(data.data.update_value).toBe(newName)
        expect(data.data.message).toBe('Username updated successfully')

        // Verify database was updated
        const updatedUser = await prisma.user.findFirst({
          where: { slUuid: existingUser.slUuid, universe: existingUser.universe }
        })
        expect(updatedUser?.username).toBe(newName)
      })

      it('should reject name update with invalid length', async () => {
        const testCases = [
          { name: 'a', error: 'username' }, // Too short
          { name: 'a'.repeat(51), error: 'username' } // Too long
        ]

        for (const testCase of testCases) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'name',
            update_value: testCase.name,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectError(data)
          expect(response.status).toBe(400)
        }
      })

      it('should update name with special characters', async () => {
        const specialNames = [
          'Test-Name',
          'Test_Name',
          'Test.Name',
          'Test Name',
          'TestName123'
        ]

        for (const newName of specialNames) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'name',
            update_value: newName,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectSuccess(data)
          expect(data.data.username).toBe(newName)
        }
      })
    })

    describe('Role Updates', () => {
      const validRoles = ['Free', 'Slave', 'Jarl', 'Bondmaid', 'Panther', 'Outlaw']

      it('should update role successfully', async () => {
        for (const role of validRoles) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'role',
            update_value: role,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectSuccess(data)
          expect(data.data).toBeDefined()
          expect(data.data.role).toBe(role.toUpperCase())
          expect(data.data.username).toBe(existingUser.username)
          expect(data.data.update_type).toBe('role')
          expect(data.data.update_value).toBe(role)
          expect(data.data.message).toBe('Role updated successfully')

          // Verify database was updated
          const updatedUser = await prisma.user.findFirst({
            where: { slUuid: existingUser.slUuid, universe: existingUser.universe }
          })
          expect(updatedUser?.role).toBe(role.toUpperCase())
        }
      })

      it('should reject invalid role', async () => {
        const invalidRoles = ['Admin', 'Moderator', 'InvalidRole', 'test', '']

        for (const role of invalidRoles) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'role',
            update_value: role,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectError(data)
          expect(response.status).toBe(400)
        }
      })

      it('should handle case-insensitive role updates', async () => {
        const roleCases = [
          { input: 'free', expected: 'FREE' },
          { input: 'FREE', expected: 'FREE' },
          { input: 'Free', expected: 'FREE' },
          { input: 'fReE', expected: 'FREE' }
        ]

        for (const testCase of roleCases) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'role',
            update_value: testCase.input,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectSuccess(data)
          expect(data.data.role).toBe(testCase.expected)
        }
      })
    })

    describe('Title Updates', () => {
      it('should update title successfully', async () => {
        const newTitle = 'Lord of the Castle'
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'title',
          update_value: newTitle,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data).toBeDefined()
        expect(data.data.title).toBe(newTitle)
        expect(data.data.update_type).toBe('title')
        expect(data.data.update_value).toBe(newTitle)
        expect(data.data.message).toBe('Title updated successfully')

        // Verify database was updated
        const updatedUser = await prisma.user.findFirst({
          where: { slUuid: existingUser.slUuid, universe: existingUser.universe }
        })
        expect(updatedUser?.title).toBe(newTitle)
      })

      it('should clear title when empty string provided', async () => {
        // First set a title
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { title: 'Initial Title' }
        })

        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'title',
          update_value: '',
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.title).toBeNull()

        // Verify database was updated
        const updatedUser = await prisma.user.findFirst({
          where: { slUuid: existingUser.slUuid, universe: existingUser.universe }
        })
        expect(updatedUser?.title).toBeNull()
      })

      it('should reject title exceeding 512 characters', async () => {
        const longTitle = 'a'.repeat(513)
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'title',
          update_value: longTitle,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })

      it('should accept title with exactly 512 characters', async () => {
        const maxTitle = 'a'.repeat(512)
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'title',
          update_value: maxTitle,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.title).toBe(maxTitle)
        expect(data.data.title.length).toBe(512)
      })
    })

    describe('Title Color Updates', () => {
      const validColors = [
        '<0, 0, 0.5>',      // Navy
        '<0, 0, 1>',        // Blue
        '<0, 1, 1>',        // Aqua
        '<0, 0.5, 0.5>',    // Teal
        '<0.5, 0.5, 0>',    // Olive
        '<0, 0.5, 0>',      // Green
        '<0, 1, 0>',        // Lime
        '<1, 1, 0>',        // Yellow
        '<1, 0.65, 0>',     // Orange
        '<1, 0, 0>',        // Red
        '<0.5, 0, 0>',      // Maroon
        '<1, 0, 1>',        // Fuchsia
        '<0.5, 0, 0.5>',    // Purple
        '<1, 1, 1>',        // White
        '<0.75, 0.75, 0.75>', // Silver
        '<0.5, 0.5, 0.5>',  // Gray
        '<0, 0, 0>',        // Black
      ]

      it('should update titleColor with predefined colors', async () => {
        for (const color of validColors) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'titleColor',
            update_value: color,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectSuccess(data)
          expect(data.data.titleColor).toBe(color)
          expect(data.data.message).toBe('Title color updated successfully')
        }
      })

      it('should accept valid custom LSL vector format', async () => {
        const customColors = [
          { input: '<0.25, 0.75, 0.33>', expected: '<0.25, 0.75, 0.33>' },
          { input: '<0.1, 0.2, 0.3>', expected: '<0.1, 0.2, 0.3>' },
          { input: '<0.999, 0.001, 0.5>', expected: '<0.999, 0.001, 0.5>' },
          { input: '< 0.5 , 0.5 , 0.5 >', expected: '<0.5, 0.5, 0.5>' }, // With spaces - gets normalized
        ]

        for (const color of customColors) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'titleColor',
            update_value: color.input,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectSuccess(data)
          expect(data.data.titleColor).toBe(color.expected)
        }
      })

      it('should reject invalid LSL vector formats', async () => {
        const invalidColors = [
          '<1.5, 0, 0>',      // Component > 1
          '<-0.1, 0, 0>',     // Negative component
          '<1, 0>',           // Only 2 components
          '<1, 0, 0, 1>',     // 4 components
          '1, 0, 0',          // Missing brackets
          '<1 0 0>',          // Missing commas
          '<a, b, c>',        // Non-numeric
          '',                 // Empty string
          'red',              // Named color
        ]

        for (const color of invalidColors) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: 'titleColor',
            update_value: color,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectError(data)
          expect(response.status).toBe(400)
        }
      })

      it('should preserve default titleColor when not specified', async () => {
        // Update name without touching titleColor
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'name',
          update_value: 'TestUser',
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        expect(data.data.titleColor).toBe('<1, 1, 1>') // Default white
      })
    })

    describe('Validation and Security', () => {
      it('should reject request with invalid signature', async () => {
        const requestBody = {
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'name',
          update_value: 'NewName',
          timestamp: new Date().toISOString(),
          signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        }

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(401)
        expect(data.error).toBe('Invalid signature')
      })

      it('should reject request with missing signature', async () => {
        const requestBody = {
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'name',
          update_value: 'NewName',
        }

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })

      it('should reject request for non-existent user', async () => {
        const nonExistentUuid = generateTestUUID()
        const requestBody = createApiBody({
          sl_uuid: nonExistentUuid,
          universe: 'Gor',
          update_type: 'name',
          update_value: 'NewName',
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(404)
        expect(data.error).toBe('User not found')
      })

      it('should reject invalid update_type', async () => {
        const invalidTypes = ['email', 'password', 'invalid', '', null]

        for (const updateType of invalidTypes) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: updateType as string,
            update_value: 'SomeValue',
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectError(data)
          expect(response.status).toBe(400)
        }
      })

      it('should reject request with invalid UUID format', async () => {
        const invalidUUIDs = [
          'not-a-uuid',
          '12345',
          '',
          'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
        ]

        for (const uuid of invalidUUIDs) {
          const requestBody = createApiBody({
            sl_uuid: uuid,
            update_type: 'name',
            update_value: 'NewName',
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectError(data)
          expect(response.status).toBe(400)
        }
      })

      it('should reject empty update_value', async () => {
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'name',
          update_value: '',
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectError(data)
        expect(response.status).toBe(400)
      })
    })

    describe('Event Logging', () => {
      it('should log title change event', async () => {
        const newTitle = 'Master Trader'
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'title',
          update_value: newTitle,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        await POST(request)

        // Check if event was logged
        const event = await prisma.event.findFirst({
          where: {
            userId: existingUser.id,
            type: 'PROFILE_TITLE_CHANGED'
          }
        })

        expect(event).toBeDefined()
        expect(event?.details).toEqual({
          description: `Title changed to: ${newTitle}`,
          update_type: 'title',
          old_value: existingUser.title || null,
          new_value: newTitle
        })
      })

      it('should log title color change event', async () => {
        const newColor = '<0, 0, 1>'
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'titleColor',
          update_value: newColor,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        await POST(request)

        // Check if event was logged
        const event = await prisma.event.findFirst({
          where: {
            userId: existingUser.id,
            type: 'PROFILE_TITLE_COLOR_CHANGED'
          }
        })

        expect(event).toBeDefined()
        expect(event?.details).toEqual({
          description: `Title color changed to: ${newColor}`,
          update_type: 'titleColor',
          old_value: existingUser.titleColor || '<1, 1, 1>',
          new_value: newColor
        })
      })

      it('should log name change event', async () => {
        const newName = 'EventTestName'
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'name',
          update_value: newName,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        await POST(request)

        // Check if event was logged
        const event = await prisma.event.findFirst({
          where: {
            userId: existingUser.id,
            type: 'PROFILE_NAME_CHANGED'
          }
        })

        expect(event).toBeDefined()
        expect(event?.details).toEqual({
          description: `Name changed to: ${newName}`,
          update_type: 'name',
          old_value: existingUser.username,
          new_value: newName
        })
      })

      it('should log role change event', async () => {
        const newRole = 'Jarl'
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'role',
          update_value: newRole,
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        await POST(request)

        // Check if event was logged
        const event = await prisma.event.findFirst({
          where: {
            userId: existingUser.id,
            type: 'PROFILE_ROLE_CHANGED'
          }
        })

        expect(event).toBeDefined()
        expect(event?.details).toEqual({
          description: `Role changed to: ${newRole}`,
          update_type: 'role',
          old_value: existingUser.role,
          new_value: newRole
        })
      })
    })

    describe('Stats Preservation', () => {
      it('should preserve user stats when updating profile', async () => {
        // First update stats to non-default values
        await prisma.userStats.update({
          where: { userId: existingUser.id },
          data: {
            health: 75,
            hunger: 60,
            thirst: 45,
            goldCoin: 10,
            silverCoin: 20,
            copperCoin: 30
          }
        })

        // Update name
        const requestBody = createApiBody({
          sl_uuid: existingUser.slUuid,
          universe: existingUser.universe,
          update_type: 'name',
          update_value: 'PreservedStatsName',
        })

        const request = createMockPostRequest('/api/users/profile', requestBody)
        const response = await POST(request)
        const data = await parseJsonResponse(response)

        expectSuccess(data)
        // Check that stats are returned correctly
        expect(data.data.health).toBe(75)
        expect(data.data.hunger).toBe(60)
        expect(data.data.thirst).toBe(45)
        expect(data.data.goldCoin).toBe(10)
        expect(data.data.silverCoin).toBe(20)
        expect(data.data.copperCoin).toBe(30)

        // Verify stats are preserved in database
        const userStats = await prisma.userStats.findUnique({
          where: { userId: existingUser.id }
        })
        expect(userStats?.health).toBe(75)
        expect(userStats?.hunger).toBe(60)
        expect(userStats?.thirst).toBe(45)
      })
    })

    describe('Concurrent Updates', () => {
      it('should handle multiple rapid updates', async () => {
        const updates = [
          { type: 'name', value: 'FirstUpdate' },
          { type: 'role', value: 'Slave' },
          { type: 'name', value: 'SecondUpdate' },
          { type: 'role', value: 'Panther' },
          { type: 'name', value: 'FinalUpdate' }
        ]

        for (const update of updates) {
          const requestBody = createApiBody({
            sl_uuid: existingUser.slUuid,
            universe: existingUser.universe,
            update_type: update.type,
            update_value: update.value,
          })

          const request = createMockPostRequest('/api/users/profile', requestBody)
          const response = await POST(request)
          const data = await parseJsonResponse(response)

          expectSuccess(data)
        }

        // Verify final state
        const finalUser = await prisma.user.findFirst({
          where: { slUuid: existingUser.slUuid, universe: existingUser.universe }
        })
        expect(finalUser?.username).toBe('FinalUpdate')
        expect(finalUser?.role).toBe('PANTHER')
      })
    })
  })
})