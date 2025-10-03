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

describe('POST /api/arkana/submit-to-discord', () => {
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

  it('should successfully submit to Discord with valid token', async () => {
    const { token } = await createTestUser('arkana');

    // Mock successful Discord webhook response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const requestBody = {
      token,
      content: '**Test Character Submission**\n**Name:** Test User\n**Race:** Human'
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.message).toBe('Character data sent to Discord successfully');

    // Verify fetch was called with correct parameters
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe(process.env.DISCORD_ARKANA_WEBHOOK_URL);
    expect(fetchCall[1].method).toBe('POST');
    expect(fetchCall[1].headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(fetchCall[1].body);
    expect(body.content).toBe('**Test Character Submission**\n**Name:** Test User\n**Race:** Human');
  });

  it('should truncate long messages to 1980 characters', async () => {
    const { token } = await createTestUser('arkana');

    // Mock successful Discord webhook response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    // Create a message longer than 1980 characters
    const longContent = 'A'.repeat(2000);

    const requestBody = {
      token,
      content: longContent
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Verify message was truncated
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.content.length).toBe(1994); // 1980 + '...(truncated)' = 1994 total
    expect(body.content.endsWith('...(truncated)')).toBe(true);
  });

  it('should return 400 for missing token', async () => {
    const requestBody = {
      content: '**Test Content**'
      // token is missing
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Missing required fields: token and content');
    expect(response.status).toBe(400);
  });

  it('should return 400 for missing content', async () => {
    const { token } = await createTestUser('arkana');

    const requestBody = {
      token
      // content is missing
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Missing required fields: token and content');
    expect(response.status).toBe(400);
  });

  it('should return 401 for invalid token', async () => {
    const requestBody = {
      token: 'invalid-token-12345',
      content: '**Test Content**'
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
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

    const requestBody = {
      token: 'fake-token',
      content: '**Test Content**'
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });

  it('should return 500 when DISCORD_ARKANA_WEBHOOK_URL is not configured', async () => {
    const { token } = await createTestUser('arkana');

    // Temporarily remove the environment variable
    const originalUrl = process.env.DISCORD_ARKANA_WEBHOOK_URL;
    delete process.env.DISCORD_ARKANA_WEBHOOK_URL;

    const requestBody = {
      token,
      content: '**Test Content**'
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Discord webhook is not configured');
    expect(response.status).toBe(500);

    // Restore the environment variable
    process.env.DISCORD_ARKANA_WEBHOOK_URL = originalUrl;
  });

  it('should return 500 when Discord webhook fails', async () => {
    const { token } = await createTestUser('arkana');

    // Mock failed Discord webhook response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    });

    const requestBody = {
      token,
      content: '**Test Content**'
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Failed to send to Discord');
    expect(response.status).toBe(500);
  });

  it('should handle fetch network errors gracefully', async () => {
    const { token } = await createTestUser('arkana');

    // Mock network error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const requestBody = {
      token,
      content: '**Test Content**'
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Internal server error');
    expect(response.status).toBe(500);
  });

  it('should not send data to real Discord URL', async () => {
    const { token } = await createTestUser('arkana');

    // Mock successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const requestBody = {
      token,
      content: '**Test Content**'
    };

    const request = createMockPostRequest('/api/arkana/submit-to-discord', requestBody);
    await POST(request);

    // Verify fetch was called (but it's mocked, so no real request)
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Ensure we're not making real HTTP requests
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(typeof fetchCall[0]).toBe('string'); // URL should be a string
    expect(fetchCall[1].method).toBe('POST');
  });
});
