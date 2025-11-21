import { GET as GetGroups } from '../groups/route';
import { POST as AddToGroup } from '../groups/add/route';
import { POST as RemoveFromGroup } from '../groups/remove/route';
import { GET as SearchUsers } from '../users/search/route';
import {
  createMockGetRequest,
  createMockPostRequest,
  createApiBody,
  createTestUser,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';

// Helper to create goreanStats with correct schema
async function createGoreanStats(userId: string, overrides: Record<string, unknown> = {}) {
  return prisma.goreanStats.create({
    data: {
      userId,
      characterName: 'Test Character',
      agentName: 'TestAgent',
      species: 'human',
      speciesCategory: 'sapient',
      culture: 'southern_cities',
      cultureType: 'cityState',
      socialStatus: 'free_man',
      casteRole: 'warrior',
      strength: 3,
      agility: 3,
      intellect: 3,
      perception: 3,
      charisma: 3,
      statPointsPool: 5,
      statPointsSpent: 10,
      healthMax: 100,
      registrationCompleted: true,
      ...overrides
    }
  });
}

describe('/api/gor/social', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe('GET /api/gor/social/groups', () => {
    it('should retrieve empty groups for new user', async () => {
      const { user } = await createTestUser('gor');

      const params = createApiBody({
        player_uuid: user.slUuid,
        universe: 'gor'
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.groups).toEqual({});
    });

    it('should retrieve groups with enriched member data', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');
      const { user: user3 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'Ally Character',
        agentName: 'AllyAgent',
        casteRole: 'warrior'
      });

      const goreanStats3 = await createGoreanStats(user3.id, {
        characterName: 'Enemy Character',
        agentName: 'EnemyAgent',
        socialStatus: 'outlaw',
        casteRole: 'assassin'
      });

      // Update user1's groups
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [goreanStats2.id],
            Enemies: [goreanStats3.id]
          }
        }
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor'
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.groups.Allies).toHaveLength(1);
      expect(data.data.groups.Allies[0].characterName).toBe('Ally Character');
      expect(data.data.groups.Allies[0].slUuid).toBe(user2.slUuid);
      expect(data.data.groups.Allies[0].goreanId).toBe(goreanStats2.id);

      expect(data.data.groups.Enemies).toHaveLength(1);
      expect(data.data.groups.Enemies[0].characterName).toBe('Enemy Character');
      expect(data.data.groups.Enemies[0].slUuid).toBe(user3.slUuid);
      expect(data.data.groups.Enemies[0].goreanId).toBe(goreanStats3.id);
    });

    it('should handle groups with non-existent members gracefully', async () => {
      const { user } = await createTestUser('gor');

      // Add groups with non-existent goreanStats IDs
      await prisma.user.update({
        where: { id: user.id },
        data: {
          groups: {
            Allies: [9999, 8888] // Non-existent IDs
          }
        }
      });

      const params = createApiBody({
        player_uuid: user.slUuid,
        universe: 'gor'
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.groups.Allies).toEqual([]); // Should filter out non-existent members
    });

    it('should return 404 for user not found', async () => {
      const params = createApiBody({
        player_uuid: '550e8400-e29b-41d4-a716-446655440999',
        universe: 'gor'
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User not found in Gor universe');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('gor');

      const params = {
        player_uuid: user.slUuid,
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockGetRequest('/api/gor/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('POST /api/gor/social/groups/add', () => {
    it('should add user to a new group', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'New Ally',
        agentName: 'AllyAgent'
      });

      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: goreanStats2.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.message).toContain('New Ally');
      expect(data.data.message).toContain('Allies');

      // Verify database update
      const updatedUser = await prisma.user.findUnique({
        where: { id: user1.id }
      });
      const groups = updatedUser?.groups as Record<string, number[]>;
      expect(groups.Allies).toContain(goreanStats2.id);
    });

    it('should add user to an existing group', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');
      const { user: user3 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'Ally One',
        agentName: 'Ally1',
        casteRole: 'scribe'
      });

      const goreanStats3 = await createGoreanStats(user3.id, {
        characterName: 'Ally Two',
        agentName: 'Ally2',
        casteRole: 'physician'
      });

      // Add first ally
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [goreanStats2.id]
          }
        }
      });

      // Add second ally
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: goreanStats3.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify both allies are in the group
      const updatedUser = await prisma.user.findUnique({
        where: { id: user1.id }
      });
      const groups = updatedUser?.groups as Record<string, number[]>;
      expect(groups.Allies).toHaveLength(2);
      expect(groups.Allies).toContain(goreanStats2.id);
      expect(groups.Allies).toContain(goreanStats3.id);
    });

    it('should return 400 when adding duplicate user to group', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'Duplicate Test',
        agentName: 'DupAgent',
        casteRole: 'merchant'
      });

      // Add user once
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [goreanStats2.id]
          }
        }
      });

      // Try to add again
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: goreanStats2.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User is already in this group');
      expect(response.status).toBe(400);
    });

    it('should return 400 when trying to add self', async () => {
      const { user } = await createTestUser('gor');

      const goreanStats = await createGoreanStats(user.id, {
        characterName: 'Self Test',
        agentName: 'SelfAgent'
      });

      const body = createApiBody({
        player_uuid: user.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: goreanStats.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Cannot add yourself to a group');
      expect(response.status).toBe(400);
    });

    it('should return 404 when target user not found', async () => {
      const { user } = await createTestUser('gor');

      const body = createApiBody({
        player_uuid: user.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: 9999
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target user not found');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('gor');

      const body = {
        player_uuid: user.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: 1,
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/gor/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('POST /api/gor/social/groups/remove', () => {
    it('should remove user from a group', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'Remove Test',
        agentName: 'RemoveAgent'
      });

      // Add user to group first
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [goreanStats2.id]
          }
        }
      });

      // Remove user
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: goreanStats2.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.message).toContain('Remove Test');
      expect(data.data.message).toContain('removed from');

      // Verify database update
      const updatedUser = await prisma.user.findUnique({
        where: { id: user1.id }
      });
      const groups = updatedUser?.groups as Record<string, number[]>;
      expect(groups.Allies).not.toContain(goreanStats2.id);
    });

    it('should keep default groups even when empty', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'Last Ally',
        agentName: 'LastAgent',
        casteRole: 'builder'
      });

      // Add user to Allies group
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [goreanStats2.id]
          }
        }
      });

      // Remove last ally
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: goreanStats2.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Allies group should still exist but be empty
      const updatedUser = await prisma.user.findUnique({
        where: { id: user1.id }
      });
      const groups = updatedUser?.groups as Record<string, number[]>;
      expect(groups.Allies).toEqual([]);
    });

    it('should delete non-default groups when empty', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'Custom Group Member',
        agentName: 'CustomAgent',
        casteRole: 'merchant'
      });

      // Add user to custom group
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            CustomGroup: [goreanStats2.id]
          }
        }
      });

      // Remove last member
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        group_name: 'CustomGroup',
        target_gorean_id: goreanStats2.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // CustomGroup should be deleted entirely
      const updatedUser = await prisma.user.findUnique({
        where: { id: user1.id }
      });
      const groups = updatedUser?.groups as Record<string, number[]>;
      expect(groups.CustomGroup).toBeUndefined();
    });

    it('should return 404 when group does not exist', async () => {
      const { user } = await createTestUser('gor');

      const body = createApiBody({
        player_uuid: user.slUuid,
        universe: 'gor',
        group_name: 'NonExistentGroup',
        target_gorean_id: 1
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Group "NonExistentGroup" not found');
      expect(response.status).toBe(404);
    });

    it('should return 400 when user not in group', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');
      const { user: user3 } = await createTestUser('gor');

      const goreanStats2 = await createGoreanStats(user2.id, {
        characterName: 'In Group',
        agentName: 'InAgent'
      });

      const goreanStats3 = await createGoreanStats(user3.id, {
        characterName: 'Not In Group',
        agentName: 'NotInAgent',
        socialStatus: 'outlaw'
      });

      // Add only goreanStats2 to group
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [goreanStats2.id]
          }
        }
      });

      // Try to remove goreanStats3 who is not in the group
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: goreanStats3.id
      }, 'gor');

      const request = createMockPostRequest('/api/gor/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User is not in this group');
      expect(response.status).toBe(400);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('gor');

      const body = {
        player_uuid: user.slUuid,
        universe: 'gor',
        group_name: 'Allies',
        target_gorean_id: 1,
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/gor/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('GET /api/gor/social/users/search', () => {
    it('should return all Gor users with completed registrations', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');
      const { user: user3 } = await createTestUser('gor');

      await createGoreanStats(user1.id, {
        characterName: 'Searcher',
        agentName: 'SearchAgent',
        casteRole: 'scribe'
      });

      await createGoreanStats(user2.id, {
        characterName: 'Result One',
        agentName: 'Result1',
        casteRole: 'warrior'
      });

      await createGoreanStats(user3.id, {
        characterName: 'Result Two',
        agentName: 'Result2',
        socialStatus: 'kajira',
        casteRole: 'pleasure_slave'
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        search: '',
        page: 1,
        limit: 20
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(2); // Should exclude the requesting user
      expect(data.data.users.some((u: { characterName: string }) => u.characterName === 'Result One')).toBe(true);
      expect(data.data.users.some((u: { characterName: string }) => u.characterName === 'Result Two')).toBe(true);
      expect(data.data.users.some((u: { characterName: string }) => u.characterName === 'Searcher')).toBe(false); // Self excluded
    });

    it('should filter users by search term (character name)', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');
      const { user: user3 } = await createTestUser('gor');

      await createGoreanStats(user1.id, {
        characterName: 'Searcher',
        agentName: 'SearchAgent',
        casteRole: 'scribe'
      });

      await createGoreanStats(user2.id, {
        characterName: 'Tarl of Ko-ro-ba',
        agentName: 'Tarl',
        casteRole: 'warrior'
      });

      await createGoreanStats(user3.id, {
        characterName: 'Vella of Ar',
        agentName: 'Vella',
        casteRole: 'physician'
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        search: 'tarl',
        page: 1,
        limit: 20
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(1);
      expect(data.data.users[0].characterName).toBe('Tarl of Ko-ro-ba');
    });

    it('should support pagination', async () => {
      const { user: searcher } = await createTestUser('gor');

      await createGoreanStats(searcher.id, {
        characterName: 'Searcher',
        agentName: 'SearchAgent',
        casteRole: 'scribe'
      });

      // Create 5 test users
      for (let i = 1; i <= 5; i++) {
        const { user } = await createTestUser('gor');
        await createGoreanStats(user.id, {
          characterName: `User ${i}`,
          agentName: `Agent${i}`
        });
      }

      // Request page 1 with limit 2
      const params = createApiBody({
        player_uuid: searcher.slUuid,
        universe: 'gor',
        search: '',
        page: 1,
        limit: 2
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(2);
      expect(data.data.pagination.page).toBe(1);
      expect(data.data.pagination.limit).toBe(2);
      expect(data.data.pagination.totalCount).toBe(5);
      expect(data.data.pagination.totalPages).toBe(3);
      expect(data.data.pagination.hasMore).toBe(true);
    });

    it('should exclude users without completed registration', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');

      await createGoreanStats(user1.id, {
        characterName: 'Searcher',
        agentName: 'SearchAgent',
        casteRole: 'scribe'
      });

      await createGoreanStats(user2.id, {
        characterName: 'Incomplete',
        agentName: 'IncompleteAgent',
        registrationCompleted: false // Incomplete registration
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        search: '',
        page: 1,
        limit: 20
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(0); // Should exclude incomplete registration
    });

    it('should return 404 for user not found', async () => {
      const params = createApiBody({
        player_uuid: '550e8400-e29b-41d4-a716-446655440999',
        universe: 'gor',
        search: '',
        page: 1,
        limit: 20
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User not found in Gor universe');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('gor');

      const params = {
        player_uuid: user.slUuid,
        universe: 'gor',
        search: '',
        page: 1,
        limit: 20,
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockGetRequest('/api/gor/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });

    it('should return Gor-specific fields (species, status, casteOrRole)', async () => {
      const { user: user1 } = await createTestUser('gor');
      const { user: user2 } = await createTestUser('gor');

      await createGoreanStats(user1.id, {
        characterName: 'Searcher',
        agentName: 'SearchAgent',
        casteRole: 'scribe'
      });

      await createGoreanStats(user2.id, {
        characterName: 'Kurii Warrior',
        agentName: 'KuriiAgent',
        species: 'kurii',
        speciesCategory: 'sapient',
        socialStatus: 'outlaw',
        casteRole: 'beast'
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'gor',
        search: '',
        page: 1,
        limit: 20
      }, 'gor');

      const request = createMockGetRequest('/api/gor/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(1);

      const kurii = data.data.users[0];
      expect(kurii.characterName).toBe('Kurii Warrior');
      expect(kurii.species).toBe('kurii');
      expect(kurii.status).toBe('outlaw');
      expect(kurii.casteOrRole).toBe('beast');
      expect(kurii.goreanId).toBeDefined();
      expect(kurii.slUuid).toBe(user2.slUuid);
      expect(kurii.lastActive).toBeDefined();
    });
  });
});
