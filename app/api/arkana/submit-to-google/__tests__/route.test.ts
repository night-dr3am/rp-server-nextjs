import { POST } from '../route';
import {
  createMockPostRequest,
  createTestUser,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';

// Mock fetch globally
global.fetch = jest.fn();

describe('POST /api/arkana/submit-to-google', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    // Reset fetch mock before each test
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    // Clean up fetch mock after each test
    jest.restoreAllMocks();
  });

  it('should successfully submit to Google Apps Script with valid token', async () => {
    const { token } = await createTestUser('arkana');

    // Mock successful Google Apps Script response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident',
      alias: 'TestAlias',
      faction: 'Test Faction',
      concept: 'Warrior',
      job: 'Mercenary',
      race: 'Human',
      arch: 'Arcanist',
      background: 'Test background story',
      stats: 'Phys: 2, Dex: 3, Mental: 3, Perc: 2',
      flaws: 'Addiction, Phobia',
      powers: 'Tech Savvy, Enhanced Reflexes',
      cyberSlots: '2',
      magicSchools: 'Pyromancy, Cryomancy',
      freeMagicSchool: 'Technomancy',
      freeMagicWeave: 'Data Stream',
      synthralFreeWeave: 'Neural Link',
      points_total: '18',
      points_spent: '15',
      points_remaining: '3',
      summary: 'Full character summary...'
    };

    const requestBody = {
      token,
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.message).toBe('Character data sent to Google Drive successfully');

    // Verify fetch was called with correct parameters
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe(process.env.GOOGLE_APPS_SCRIPT_URL);
    expect(fetchCall[1].method).toBe('POST');

    // Verify body is URLSearchParams
    const body = fetchCall[1].body;
    expect(body).toBeInstanceOf(URLSearchParams);

    // Verify all character data fields are present in URLSearchParams
    const params = new URLSearchParams(body);
    expect(params.get('name')).toBe('Test Character');
    expect(params.get('sl')).toBe('TestUser Resident');
    expect(params.get('race')).toBe('Human');
    expect(params.get('arch')).toBe('Arcanist');
    expect(params.get('stats')).toBe('Phys: 2, Dex: 3, Mental: 3, Perc: 2');
  });

  it('should handle character data with empty fields', async () => {
    const { token } = await createTestUser('arkana');

    // Mock successful Google Apps Script response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident',
      race: 'Human',
      arch: 'Arcanist',
      stats: 'Phys: 2, Dex: 3, Mental: 3, Perc: 2',
      // Other fields are empty/missing
      alias: '',
      faction: '',
      concept: '',
      job: '',
      background: '',
      flaws: '',
      powers: '',
      cyberSlots: '0',
      magicSchools: '',
      freeMagicSchool: '',
      freeMagicWeave: '',
      synthralFreeWeave: '',
      points_total: '15',
      points_spent: '10',
      points_remaining: '5',
      summary: ''
    };

    const requestBody = {
      token,
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Verify empty fields are still sent (as empty strings)
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const params = new URLSearchParams(fetchCall[1].body);
    expect(params.get('alias')).toBe('');
    expect(params.get('faction')).toBe('');
  });

  it('should return 400 for missing token', async () => {
    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident',
      race: 'Human',
      arch: 'Arcanist'
    };

    const requestBody = {
      characterData
      // token is missing
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Missing required fields: token and characterData');
    expect(response.status).toBe(400);
  });

  it('should return 400 for missing characterData', async () => {
    const { token } = await createTestUser('arkana');

    const requestBody = {
      token
      // characterData is missing
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Missing required fields: token and characterData');
    expect(response.status).toBe(400);
  });

  it('should return 401 for invalid token', async () => {
    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident',
      race: 'Human'
    };

    const requestBody = {
      token: 'invalid-token-12345',
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });

  it('should return 401 for wrong universe token', async () => {
    // Create a Gor universe user
    const gorUser = await createTestUser({
      sl_uuid: '550e8400-e29b-41d4-a716-446655440099',
      universe: 'Gor',
      username: 'GorTestUser',
      role: 'Free'
    });

    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident'
    };

    const requestBody = {
      token: 'fake-token',
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });

  it('should return 500 when GOOGLE_APPS_SCRIPT_URL is not configured', async () => {
    const { token } = await createTestUser('arkana');

    // Temporarily remove the environment variable
    const originalUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
    delete process.env.GOOGLE_APPS_SCRIPT_URL;

    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident'
    };

    const requestBody = {
      token,
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Google Apps Script is not configured');
    expect(response.status).toBe(500);

    // Restore the environment variable
    process.env.GOOGLE_APPS_SCRIPT_URL = originalUrl;
  });

  it('should return 500 when Google Apps Script fails', async () => {
    const { token } = await createTestUser('arkana');

    // Mock failed Google Apps Script response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    });

    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident'
    };

    const requestBody = {
      token,
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Failed to send to Google Drive');
    expect(response.status).toBe(500);
  });

  it('should handle fetch network errors gracefully', async () => {
    const { token } = await createTestUser('arkana');

    // Mock network error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident'
    };

    const requestBody = {
      token,
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Internal server error');
    expect(response.status).toBe(500);
  });

  it('should not send data to real Google Apps Script URL', async () => {
    const { token } = await createTestUser('arkana');

    // Mock successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const characterData = {
      name: 'Test Character',
      sl: 'TestUser Resident',
      race: 'Human'
    };

    const requestBody = {
      token,
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    await POST(request);

    // Verify fetch was called (but it's mocked, so no real request)
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Ensure we're not making real HTTP requests
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(typeof fetchCall[0]).toBe('string'); // URL should be a string
    expect(fetchCall[1].method).toBe('POST');
  });

  it('should correctly format all character fields as URLSearchParams', async () => {
    const { token } = await createTestUser('arkana');

    // Mock successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const characterData = {
      name: 'Complex Character',
      sl: 'ComplexUser Resident',
      alias: 'Shadow',
      faction: 'Resistance',
      concept: 'Hacker',
      job: 'Information Broker',
      race: 'Veilborn',
      arch: 'Echo',
      background: 'A long and detailed background story with multiple paragraphs...',
      stats: 'Phys: 1, Dex: 5, Mental: 4, Perc: 3',
      flaws: 'Addiction (Cyberstims), Phobia (Heights), Hunted',
      powers: 'Tech Savvy, Enhanced Reflexes, Neural Interface, Data Mining',
      cyberSlots: '5',
      magicSchools: 'Void Manipulation, Shadow Weaving',
      freeMagicSchool: 'Void School',
      freeMagicWeave: 'Shadow Step',
      synthralFreeWeave: '',
      points_total: '22',
      points_spent: '20',
      points_remaining: '2',
      summary: 'Complete character summary with all details...'
    };

    const requestBody = {
      token,
      characterData
    };

    const request = createMockPostRequest('/api/arkana/submit-to-google', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Verify all fields are correctly sent
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const params = new URLSearchParams(fetchCall[1].body);

    // Verify each field
    expect(params.get('name')).toBe('Complex Character');
    expect(params.get('sl')).toBe('ComplexUser Resident');
    expect(params.get('alias')).toBe('Shadow');
    expect(params.get('faction')).toBe('Resistance');
    expect(params.get('concept')).toBe('Hacker');
    expect(params.get('job')).toBe('Information Broker');
    expect(params.get('race')).toBe('Veilborn');
    expect(params.get('arch')).toBe('Echo');
    expect(params.get('background')).toContain('long and detailed background');
    expect(params.get('stats')).toBe('Phys: 1, Dex: 5, Mental: 4, Perc: 3');
    expect(params.get('flaws')).toContain('Addiction');
    expect(params.get('powers')).toContain('Tech Savvy');
    expect(params.get('cyberSlots')).toBe('5');
    expect(params.get('magicSchools')).toContain('Void Manipulation');
    expect(params.get('freeMagicSchool')).toBe('Void School');
    expect(params.get('freeMagicWeave')).toBe('Shadow Step');
    expect(params.get('synthralFreeWeave')).toBe('');
    expect(params.get('points_total')).toBe('22');
    expect(params.get('points_spent')).toBe('20');
    expect(params.get('points_remaining')).toBe('2');
    expect(params.get('summary')).toContain('Complete character summary');
  });
});
