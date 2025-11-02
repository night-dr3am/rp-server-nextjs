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

describe('/api/arkana/social', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe('GET /api/arkana/social/groups', () => {
    it('should retrieve empty groups for new user', async () => {
      const { user } = await createTestUser('arkana');

      const params = createApiBody({
        player_uuid: user.slUuid,
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.groups).toEqual({});
    });

    it('should retrieve groups with enriched member data', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');
      const { user: user3 } = await createTestUser('arkana');

      // Create Arkana characters for user2 and user3
      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Ally Character',
          agentName: 'AllyAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      const arkanaStats3 = await prisma.arkanaStats.create({
        data: {
          userId: user3.id,
          characterName: 'Enemy Character',
          agentName: 'EnemyAgent',
          race: 'gaki',
          archetype: 'Fighter',
          physical: 4,
          dexterity: 3,
          mental: 2,
          perception: 3,
          hitPoints: 20,
          registrationCompleted: true
        }
      });

      // Update user1's groups
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [arkanaStats2.id],
            Enemies: [arkanaStats3.id]
          }
        }
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.groups.Allies).toHaveLength(1);
      expect(data.data.groups.Allies[0].characterName).toBe('Ally Character');
      expect(data.data.groups.Allies[0].slUuid).toBe(user2.slUuid);
      expect(data.data.groups.Allies[0].arkanaId).toBe(arkanaStats2.id);

      expect(data.data.groups.Enemies).toHaveLength(1);
      expect(data.data.groups.Enemies[0].characterName).toBe('Enemy Character');
      expect(data.data.groups.Enemies[0].slUuid).toBe(user3.slUuid);
      expect(data.data.groups.Enemies[0].arkanaId).toBe(arkanaStats3.id);
    });

    it('should handle groups with non-existent members gracefully', async () => {
      const { user } = await createTestUser('arkana');

      // Add groups with non-existent arkanaStats IDs
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
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.groups.Allies).toEqual([]); // Should filter out non-existent members
    });

    it('should return 404 for user not found', async () => {
      const params = createApiBody({
        player_uuid: '550e8400-e29b-41d4-a716-446655440999',
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('arkana');

      const params = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockGetRequest('/api/arkana/social/groups', params);
      const response = await GetGroups(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('POST /api/arkana/social/groups/add', () => {
    it('should add user to a new group', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');

      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'New Ally',
          agentName: 'AllyAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: arkanaStats2.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/add', body);
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
      expect(groups.Allies).toContain(arkanaStats2.id);
    });

    it('should add user to an existing group', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');
      const { user: user3 } = await createTestUser('arkana');

      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Ally One',
          agentName: 'Ally1',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      const arkanaStats3 = await prisma.arkanaStats.create({
        data: {
          userId: user3.id,
          characterName: 'Ally Two',
          agentName: 'Ally2',
          race: 'gaki',
          archetype: 'Fighter',
          physical: 4,
          dexterity: 3,
          mental: 2,
          perception: 3,
          hitPoints: 20,
          registrationCompleted: true
        }
      });

      // Add first ally
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [arkanaStats2.id]
          }
        }
      });

      // Add second ally
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: arkanaStats3.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify both allies are in the group
      const updatedUser = await prisma.user.findUnique({
        where: { id: user1.id }
      });
      const groups = updatedUser?.groups as Record<string, number[]>;
      expect(groups.Allies).toHaveLength(2);
      expect(groups.Allies).toContain(arkanaStats2.id);
      expect(groups.Allies).toContain(arkanaStats3.id);
    });

    it('should return 400 when adding duplicate user to group', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');

      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Duplicate Test',
          agentName: 'DupAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      // Add user once
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [arkanaStats2.id]
          }
        }
      });

      // Try to add again
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: arkanaStats2.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User is already in this group');
      expect(response.status).toBe(400);
    });

    it('should return 400 when trying to add self', async () => {
      const { user } = await createTestUser('arkana');

      const arkanaStats = await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          characterName: 'Self Test',
          agentName: 'SelfAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      const body = createApiBody({
        player_uuid: user.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: arkanaStats.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Cannot add yourself to a group');
      expect(response.status).toBe(400);
    });

    it('should return 404 when target user not found', async () => {
      const { user } = await createTestUser('arkana');

      const body = createApiBody({
        player_uuid: user.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: 9999
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target user not found');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('arkana');

      const body = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: 1,
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/social/groups/add', body);
      const response = await AddToGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('POST /api/arkana/social/groups/remove', () => {
    it('should remove user from a group', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');

      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Remove Test',
          agentName: 'RemoveAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      // Add user to group first
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [arkanaStats2.id]
          }
        }
      });

      // Remove user
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: arkanaStats2.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/remove', body);
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
      expect(groups.Allies).not.toContain(arkanaStats2.id);
    });

    it('should keep default groups even when empty', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');

      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Last Ally',
          agentName: 'LastAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      // Add user to Allies group
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [arkanaStats2.id]
          }
        }
      });

      // Remove last ally
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: arkanaStats2.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/remove', body);
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
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');

      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Custom Group Member',
          agentName: 'CustomAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      // Add user to custom group
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            CustomGroup: [arkanaStats2.id]
          }
        }
      });

      // Remove last member
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        group_name: 'CustomGroup',
        target_arkana_id: arkanaStats2.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/remove', body);
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
      const { user } = await createTestUser('arkana');

      const body = createApiBody({
        player_uuid: user.slUuid,
        universe: 'arkana',
        group_name: 'NonExistentGroup',
        target_arkana_id: 1
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Group "NonExistentGroup" not found');
      expect(response.status).toBe(404);
    });

    it('should return 400 when user not in group', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');
      const { user: user3 } = await createTestUser('arkana');

      const arkanaStats2 = await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'In Group',
          agentName: 'InAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      const arkanaStats3 = await prisma.arkanaStats.create({
        data: {
          userId: user3.id,
          characterName: 'Not In Group',
          agentName: 'NotInAgent',
          race: 'gaki',
          archetype: 'Fighter',
          physical: 4,
          dexterity: 3,
          mental: 2,
          perception: 3,
          hitPoints: 20,
          registrationCompleted: true
        }
      });

      // Add only arkanaStats2 to group
      await prisma.user.update({
        where: { id: user1.id },
        data: {
          groups: {
            Allies: [arkanaStats2.id]
          }
        }
      });

      // Try to remove arkanaStats3 who is not in the group
      const body = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: arkanaStats3.id
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User is not in this group');
      expect(response.status).toBe(400);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('arkana');

      const body = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        group_name: 'Allies',
        target_arkana_id: 1,
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/social/groups/remove', body);
      const response = await RemoveFromGroup(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('GET /api/arkana/social/users/search', () => {
    it('should return all Arkana users with completed registrations', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');
      const { user: user3 } = await createTestUser('arkana');

      // Create Arkana characters for all users
      await prisma.arkanaStats.create({
        data: {
          userId: user1.id,
          characterName: 'Searcher',
          agentName: 'SearchAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Result One',
          agentName: 'Result1',
          race: 'gaki',
          archetype: 'Fighter',
          physical: 4,
          dexterity: 3,
          mental: 2,
          perception: 3,
          hitPoints: 20,
          registrationCompleted: true
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user3.id,
          characterName: 'Result Two',
          agentName: 'Result2',
          race: 'strigoi',
          archetype: 'Life',
          physical: 2,
          dexterity: 3,
          mental: 4,
          perception: 3,
          hitPoints: 12,
          registrationCompleted: true
        }
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        search: '',
        page: 1,
        limit: 20
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(2); // Should exclude the requesting user
      expect(data.data.users.some((u: { characterName: string }) => u.characterName === 'Result One')).toBe(true);
      expect(data.data.users.some((u: { characterName: string }) => u.characterName === 'Result Two')).toBe(true);
      expect(data.data.users.some((u: { characterName: string }) => u.characterName === 'Searcher')).toBe(false); // Self excluded
    });

    it('should filter users by search term (character name)', async () => {
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');
      const { user: user3 } = await createTestUser('arkana');

      await prisma.arkanaStats.create({
        data: {
          userId: user1.id,
          characterName: 'Searcher',
          agentName: 'SearchAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'John Shadow',
          agentName: 'JShadow',
          race: 'gaki',
          archetype: 'Fighter',
          physical: 4,
          dexterity: 3,
          mental: 2,
          perception: 3,
          hitPoints: 20,
          registrationCompleted: true
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user3.id,
          characterName: 'Jane Lightbringer',
          agentName: 'JLight',
          race: 'strigoi',
          archetype: 'Life',
          physical: 2,
          dexterity: 3,
          mental: 4,
          perception: 3,
          hitPoints: 12,
          registrationCompleted: true
        }
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        search: 'shadow',
        page: 1,
        limit: 20
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(1);
      expect(data.data.users[0].characterName).toBe('John Shadow');
    });

    it('should support pagination', async () => {
      const { user: searcher } = await createTestUser('arkana');

      await prisma.arkanaStats.create({
        data: {
          userId: searcher.id,
          characterName: 'Searcher',
          agentName: 'SearchAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      // Create 5 test users
      const users = [];
      for (let i = 1; i <= 5; i++) {
        const { user } = await createTestUser('arkana');
        await prisma.arkanaStats.create({
          data: {
            userId: user.id,
            characterName: `User ${i}`,
            agentName: `Agent${i}`,
            race: 'human',
            archetype: 'Arcanist',
            physical: 3,
            dexterity: 2,
            mental: 4,
            perception: 3,
            hitPoints: 15,
            registrationCompleted: true
          }
        });
        users.push(user);
      }

      // Request page 1 with limit 2
      const params = createApiBody({
        player_uuid: searcher.slUuid,
        universe: 'arkana',
        search: '',
        page: 1,
        limit: 2
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/users/search', params);
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
      const { user: user1 } = await createTestUser('arkana');
      const { user: user2 } = await createTestUser('arkana');

      await prisma.arkanaStats.create({
        data: {
          userId: user1.id,
          characterName: 'Searcher',
          agentName: 'SearchAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: true
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user2.id,
          characterName: 'Incomplete',
          agentName: 'IncompleteAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: false // Incomplete registration
        }
      });

      const params = createApiBody({
        player_uuid: user1.slUuid,
        universe: 'arkana',
        search: '',
        page: 1,
        limit: 20
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.users).toHaveLength(0); // Should exclude incomplete registration
    });

    it('should return 404 for user not found', async () => {
      const params = createApiBody({
        player_uuid: '550e8400-e29b-41d4-a716-446655440999',
        universe: 'arkana',
        search: '',
        page: 1,
        limit: 20
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('arkana');

      const params = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        search: '',
        page: 1,
        limit: 20,
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockGetRequest('/api/arkana/social/users/search', params);
      const response = await SearchUsers(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });
  });
});
