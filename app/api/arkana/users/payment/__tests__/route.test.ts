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

describe('POST /api/arkana/users/payment', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  const createTestUsers = async () => {
    const senderUuid = generateTestUUID()
    const recipientUuid = generateTestUUID()
    const senderUsername = generateTestUsername()
    const recipientUsername = generateTestUsername()

    // Create sender with arkana stats and 10 credits, 8 chips
    const sender = await prisma.user.create({
      data: {
        slUuid: senderUuid,
        universe: 'arkana',
        username: senderUsername,
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
            characterName: 'Sender Character',
            agentName: `${senderUsername} Resident`,
            race: 'Human',
            archetype: 'Arcanist',
            physical: 3,
            dexterity: 3,
            mental: 4,
            perception: 2,
            maxHP: 15,
            credits: 10,
            chips: 8
          }
        }
      }
    })

    // Create recipient with arkana stats and 5 credits, 12 chips
    const recipient = await prisma.user.create({
      data: {
        slUuid: recipientUuid,
        universe: 'arkana',
        username: recipientUsername,
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
            characterName: 'Recipient Character',
            agentName: `${recipientUsername} Resident`,
            race: 'Elf',
            archetype: 'Technomancer',
            physical: 2,
            dexterity: 4,
            mental: 3,
            perception: 3,
            maxHP: 12,
            credits: 5,
            chips: 12
          }
        }
      }
    })

    return { senderUuid, recipientUuid, sender, recipient }
  }

  it('should successfully send credits payment', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 3
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Successfully sent 3 credits to recipient')
    expect(data.data.transaction.currency).toBe('credits')
    expect(data.data.transaction.amount).toBe(3)
    expect(data.data.transaction.sender_new_balance).toBe(7) // 10 - 3
    expect(data.data.transaction.recipient_new_balance).toBe(8) // 5 + 3
  })

  it('should successfully send chips payment', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'chips',
      amount: 5
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.message).toBe('Successfully sent 5 chips to recipient')
    expect(data.data.transaction.currency).toBe('chips')
    expect(data.data.transaction.amount).toBe(5)
    expect(data.data.transaction.sender_new_balance).toBe(3) // 8 - 5
    expect(data.data.transaction.recipient_new_balance).toBe(17) // 12 + 5
  })

  it('should return 400 for insufficient credits', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 15 // Sender only has 10 credits
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Insufficient credits. You have 10 credits, but tried to send 15.')
  })

  it('should return 400 for insufficient chips', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'chips',
      amount: 10 // Sender only has 8 chips
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Insufficient chips. You have 8 chips, but tried to send 10.')
  })

  it('should return 404 for non-existent sender', async () => {
    const { recipientUuid } = await createTestUsers()
    const nonExistentUuid = generateTestUUID()

    const body = createApiBody({
      sender_uuid: nonExistentUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 1
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Sender not found in Arkana universe')
  })

  it('should return 404 for non-existent recipient', async () => {
    const { senderUuid } = await createTestUsers()
    const nonExistentUuid = generateTestUUID()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: nonExistentUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 1
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Recipient not found in Arkana universe')
  })

  it('should return 400 for sender without Arkana character', async () => {
    const senderUuid = generateTestUUID()
    const { recipientUuid } = await createTestUsers()

    // Create sender without arkana stats
    await prisma.user.create({
      data: {
        slUuid: senderUuid,
        universe: 'arkana',
        username: generateTestUsername(),
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
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 1
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Sender has no Arkana character')
  })

  it('should return 400 for recipient without Arkana character', async () => {
    const { senderUuid } = await createTestUsers()
    const recipientUuid = generateTestUUID()

    // Create recipient without arkana stats
    await prisma.user.create({
      data: {
        slUuid: recipientUuid,
        universe: 'arkana',
        username: generateTestUsername(),
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
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 1
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Recipient has no Arkana character')
  })

  it('should return 400 for wrong universe', async () => {
    const body = createApiBody({
      sender_uuid: generateTestUUID(),
      recipient_uuid: generateTestUUID(),
      universe: 'gor', // Wrong universe
      currency: 'credits',
      amount: 1
    }, 'gor')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, '"universe" must be [arkana]')
  })

  it('should return 400 for invalid currency', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'gold', // Invalid currency
      amount: 1
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, '"currency" must be one of [credits, chips]')
  })

  it('should return 400 for zero amount', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 0
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, '"amount" must be greater than or equal to 1')
  })

  it('should return 400 for negative amount', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: -5
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, '"amount" must be greater than or equal to 1')
  })

  it('should return 400 for same sender and recipient', async () => {
    const { senderUuid } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: senderUuid, // Same as sender
      universe: 'arkana',
      currency: 'credits',
      amount: 1
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'Sender and recipient cannot be the same')
  })

  it('should return 401 for invalid signature', async () => {
    const { senderUuid, recipientUuid } = await createTestUsers()

    const body = {
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 1,
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature'
    }

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
  })

  it('should return 400 for invalid input format', async () => {
    const body = {
      sender_uuid: 'invalid-uuid',
      recipient_uuid: generateTestUUID(),
      universe: 'arkana',
      currency: 'credits',
      amount: 'not-a-number',
      timestamp: 'invalid-timestamp',
      signature: 'signature'
    }

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
    expect(data.error).toContain('must be a valid GUID')
  })

  it('should create event logs for both users', async () => {
    const { senderUuid, recipientUuid, sender, recipient } = await createTestUsers()

    const body = createApiBody({
      sender_uuid: senderUuid,
      recipient_uuid: recipientUuid,
      universe: 'arkana',
      currency: 'credits',
      amount: 2
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/users/payment', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)

    // Check sender event log
    const senderEvent = await prisma.event.findFirst({
      where: {
        userId: sender.id,
        type: 'PAYMENT_SENT'
      }
    })

    expect(senderEvent).toBeTruthy()
    expect(senderEvent?.details).toEqual(
      expect.objectContaining({
        recipient: recipientUuid,
        recipientName: 'Recipient Character',
        currency: 'credits',
        amount: 2,
        newBalance: 8
      })
    )

    // Check recipient event log
    const recipientEvent = await prisma.event.findFirst({
      where: {
        userId: recipient.id,
        type: 'PAYMENT_RECEIVED'
      }
    })

    expect(recipientEvent).toBeTruthy()
    expect(recipientEvent?.details).toEqual(
      expect.objectContaining({
        sender: senderUuid,
        senderName: 'Sender Character',
        currency: 'credits',
        amount: 2,
        newBalance: 7
      })
    )
  })
})