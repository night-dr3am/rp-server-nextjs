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

describe('POST /api/arkana/auth/register', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanupDatabase()
  })

  it('should register new user in Arkana universe successfully', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      username: username,
      role: 'Free'
    }, 'arkana')

    const request = createMockPostRequest('/api/arkana/auth/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectSuccess(data)
    expect(data.data.sl_uuid).toBe(uuid)
    expect(data.data.universe).toBe('arkana')
    expect(data.data.role).toBe('FREE')
    expect(data.data.health).toBe(100)
    expect(data.data.hasArkanaCharacter).toBe(false)
    expect(data.data.arkanaStats).toBeNull()
    expect(data.data.message).toBe('User registered successfully in Arkana universe')
  })

  it('should return 409 for duplicate user registration', async () => {
    const uuid = generateTestUUID()
    const username = generateTestUsername()

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'arkana',
      username: username,
      role: 'Free'
    }, 'arkana')

    // Register user first time
    const request1 = createMockPostRequest('/api/arkana/auth/register', body)
    const response1 = await POST(request1)
    const data1 = await parseJsonResponse(response1)
    expectSuccess(data1)

    // Try to register same user again
    const request2 = createMockPostRequest('/api/arkana/auth/register', body)
    const response2 = await POST(request2)
    const data2 = await parseJsonResponse(response2)

    expectError(data2, 'User already registered in Arkana universe')
  })

  it('should return 400 for wrong universe', async () => {
    const body = createApiBody({
      sl_uuid: generateTestUUID(),
      universe: 'gor', // Wrong universe
      username: generateTestUsername(),
      role: 'Free'
    }, 'gor')

    const request = createMockPostRequest('/api/arkana/auth/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data, 'This endpoint is only for Arkana universe registration')
  })

  it('should return 401 for invalid signature', async () => {
    const body = {
      sl_uuid: generateTestUUID(),
      universe: 'arkana',
      username: generateTestUsername(),
      role: 'Free',
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature'
    }

    const request = createMockPostRequest('/api/arkana/auth/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
  })

  it('should return 400 for invalid input', async () => {
    const body = {
      sl_uuid: 'invalid-uuid',
      universe: 'arkana',
      username: '',
      role: 'invalid-role',
      timestamp: 'invalid-timestamp',
      signature: 'signature'
    }

    const request = createMockPostRequest('/api/arkana/auth/register', body)
    const response = await POST(request)
    const data = await parseJsonResponse(response)

    expectError(data)
    expect(data.error).toContain('must be a valid GUID')
  })
})