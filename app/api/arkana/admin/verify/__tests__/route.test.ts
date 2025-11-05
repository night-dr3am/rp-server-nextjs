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
import { prisma } from '@/lib/prisma';

describe('POST /api/arkana/admin/verify', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should verify admin access for admin user', async () => {
    const { user, token } = await createTestUser('arkana');

    // Create admin arkana stats
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Admin User',
        agentName: 'AdminAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    const request = createMockPostRequest('/api/arkana/admin/verify', {
      token
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.message).toContain('Admin access verified');
    expect(data.data.user.universe).toBe('arkana');
    expect(data.data.user.arkanaRole).toBe('admin');
  });

  it('should deny access for non-admin user', async () => {
    const { user, token } = await createTestUser('arkana');

    // Create regular player arkana stats
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Regular Player',
        agentName: 'PlayerAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'player', // Not admin
        registrationCompleted: true
      }
    });

    const request = createMockPostRequest('/api/arkana/admin/verify', {
      token
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Administrator privileges required');
  });

  it('should deny access for non-arkana universe user', async () => {
    const { token } = await createTestUser('Gor'); // Gor universe

    const request = createMockPostRequest('/api/arkana/admin/verify', {
      token
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Arkana universe');
  });

  it('should deny access with invalid token', async () => {
    const request = createMockPostRequest('/api/arkana/admin/verify', {
      token: 'invalid_token_12345'
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
  });

  it('should deny access for user without Arkana character', async () => {
    const { token } = await createTestUser('arkana');

    // Don't create arkanaStats

    const request = createMockPostRequest('/api/arkana/admin/verify', {
      token
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('No Arkana character found');
  });

  it('should require token in request body', async () => {
    const request = createMockPostRequest('/api/arkana/admin/verify', {});

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('required');
  });
});
