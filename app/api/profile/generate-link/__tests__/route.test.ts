import { POST } from '../route';
import {
  createMockPostRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  createTestUser
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { generateSignature } from '@/lib/signature';

describe('POST /api/profile/generate-link', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should generate Gor profile link with /profile/ path', async () => {
    const testUser = {
      sl_uuid: '12345678-1234-1234-1234-123456789012',
      username: 'TestGorUser',
      universe: 'Gor',
      role: 'Free'
    };
    const user = await createTestUser(testUser);

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'Gor');

    const request = createMockPostRequest('/api/profile/generate-link', {
      sl_uuid: user.slUuid,
      universe: 'Gor',
      timestamp,
      signature
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.profileUrl).toContain('/profile/');
    expect(data.data.profileUrl).not.toContain('/arkana/profile/');
    expect(data.data.profileUrl).toContain(user.slUuid);
  });

  it('should generate Arkana profile link with /arkana/profile/ path', async () => {
    const testUser = {
      sl_uuid: '87654321-4321-4321-4321-210987654321',
      username: 'TestArkanaUser',
      universe: 'arkana',
      role: 'Free'
    };
    const user = await createTestUser(testUser);

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const request = createMockPostRequest('/api/profile/generate-link', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.profileUrl).toContain('/arkana/profile/');
    expect(data.data.profileUrl).not.toMatch(/^\/profile\//);
    expect(data.data.profileUrl).toContain(user.slUuid);
  });

  it('should reject request with invalid signature', async () => {
    const testUser = {
      sl_uuid: '11111111-1111-1111-1111-111111111111',
      username: 'TestUser',
      universe: 'Gor',
      role: 'Free'
    };
    const user = await createTestUser(testUser);

    const timestamp = new Date().toISOString();

    const request = createMockPostRequest('/api/profile/generate-link', {
      sl_uuid: user.slUuid,
      universe: 'Gor',
      timestamp,
      signature: 'a'.repeat(64) // Valid format, but incorrect signature
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Invalid signature');
  });

  it('should reject request for non-existent user', async () => {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'Gor');

    const request = createMockPostRequest('/api/profile/generate-link', {
      sl_uuid: '99999999-9999-9999-9999-999999999999',
      universe: 'Gor',
      timestamp,
      signature
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('User not found');
  });

  it('should include token and expiry in response', async () => {
    const testUser = {
      sl_uuid: '22222222-2222-2222-2222-222222222222',
      username: 'TestUser2',
      universe: 'Gor',
      role: 'Free'
    };
    const user = await createTestUser(testUser);

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'Gor');

    const request = createMockPostRequest('/api/profile/generate-link', {
      sl_uuid: user.slUuid,
      universe: 'Gor',
      timestamp,
      signature
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.token).toBeDefined();
    expect(data.data.expiresAt).toBeDefined();
    expect(data.data.user.username).toBe('TestUser2');
    expect(data.data.user.uuid).toBe(user.slUuid);
  });
});
