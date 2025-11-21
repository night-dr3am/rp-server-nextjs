import { GET, POST } from '../route';
import { generateSignature } from '@/lib/signature';
import {
  createMockPostRequest,
  createMockGetRequest,
  parseJsonResponse,
  expectSuccess,
  expectError
} from '@/__tests__/utils/test-helpers';

// Helper to create test body with signature
function createRequestBody(data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const universe = 'gor';
  return {
    player_uuid: crypto.randomUUID(), // Required but not used for lookup
    ...data,
    universe,
    timestamp,
    signature: generateSignature(timestamp, universe)
  };
}

describe('GET/POST /api/gor/combat/ability-info', () => {
  describe('Validation', () => {
    it('should reject request without ability_id or ability_name', async () => {
      const body = createRequestBody({});

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'ability_id');
    });

    it('should reject invalid signature', async () => {
      const body = {
        player_uuid: crypto.randomUUID(),
        ability_id: 'combat_expertise',
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'invalid_signature'
      };

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'signature');
    });

    it('should reject invalid use_mode', async () => {
      const body = createRequestBody({
        ability_id: 'combat_expertise',
        use_mode: 'invalid_mode'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'use_mode');
    });
  });

  describe('Ability Not Found', () => {
    it('should return 404 for non-existent ability ID', async () => {
      const body = createRequestBody({
        ability_id: 'nonexistent_ability'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not found');
    });

    it('should return 404 for non-existent ability name', async () => {
      const body = createRequestBody({
        ability_name: 'Nonexistent Power'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not found');
    });
  });

  describe('Ability Lookup', () => {
    it('should find ability by ID', async () => {
      const body = createRequestBody({
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.id).toBe('combat_expertise');
      expect(data.data).toHaveProperty('name');
      expect(data.data).toHaveProperty('description');
      expect(data.data).toHaveProperty('targetType');
      expect(data.data).toHaveProperty('effects');
      expect(data.data).toHaveProperty('confirmMessage');
    });

    it('should find ability by name (case-insensitive)', async () => {
      const body = createRequestBody({
        ability_name: 'COMBAT EXPERTISE'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.id).toBe('combat_expertise');
    });

    it('should include effect details for Combat Expertise', async () => {
      const body = createRequestBody({
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.targetType).toBe('self');
      expect(data.data.effects).toHaveProperty('ability');
      expect(data.data.detailedMessage).toBeTruthy();
    });

    it('should include cooldown info for Second Wind', async () => {
      const body = createRequestBody({
        ability_id: 'second_wind'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.cooldown).toBe(1800); // 30 minutes
      // Confirm message should mention cooldown
      const confirmMsg = decodeURIComponent(data.data.confirmMessage);
      expect(confirmMsg).toContain('Cooldown');
    });

    it('should include range for area abilities', async () => {
      const body = createRequestBody({
        ability_id: 'tactical_command'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.targetType).toBe('area');
      expect(data.data.range).toBe(10);
    });

    it('should work with GET request using query params', async () => {
      const timestamp = new Date().toISOString();
      const universe = 'gor';
      const signature = generateSignature(timestamp, universe);
      const player_uuid = crypto.randomUUID();

      const url = `/api/gor/combat/ability-info?player_uuid=${player_uuid}&ability_id=combat_expertise&universe=${universe}&timestamp=${encodeURIComponent(timestamp)}&signature=${signature}`;
      const request = createMockGetRequest(url);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.id).toBe('combat_expertise');
    });
  });

  describe('Use Mode Filtering', () => {
    it('should filter effects by ability mode', async () => {
      const body = createRequestBody({
        ability_id: 'combat_expertise',
        use_mode: 'ability'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Combat Expertise only has ability effects
      expect(data.data.effects.ability).toBeDefined();
    });

    it('should include all effects with mode "all"', async () => {
      const body = createRequestBody({
        ability_id: 'combat_expertise',
        use_mode: 'all'
      });

      const request = createMockPostRequest('/api/gor/combat/ability-info', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data).toHaveProperty('detailedMessage');
    });
  });
});
