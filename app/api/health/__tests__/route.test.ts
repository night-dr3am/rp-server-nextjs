import { GET } from '../route'
import {
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers'
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup'

describe('/api/health', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  describe('GET', () => {
    it('should return healthy status when database is connected', async () => {
      const response = await GET()
      const data = await parseJsonResponse(response)

      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.database).toBe('connected')
      expect(data.timestamp).toBeDefined()
      expect(data.version).toBe('1.0.0')
      
      // Validate timestamp format
      expect(new Date(data.timestamp).getTime()).not.toBeNaN()
    })

    it('should include all required health check fields', async () => {
      const response = await GET()
      const data = await parseJsonResponse(response)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('status')
      expect(data).toHaveProperty('database')
      expect(data).toHaveProperty('timestamp')
      expect(data).toHaveProperty('version')
      
      // Validate field types
      expect(typeof data.status).toBe('string')
      expect(typeof data.database).toBe('string')
      expect(typeof data.timestamp).toBe('string')
      expect(typeof data.version).toBe('string')
    })

    it('should return timestamp in ISO format', async () => {
      const response = await GET()
      const data = await parseJsonResponse(response)

      expect(response.status).toBe(200)
      
      // Validate ISO 8601 format
      const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      expect(data.timestamp).toMatch(timestampRegex)
      
      // Ensure timestamp is recent (within last 5 seconds)
      const now = new Date()
      const responseTime = new Date(data.timestamp)
      const timeDiff = Math.abs(now.getTime() - responseTime.getTime())
      expect(timeDiff).toBeLessThan(5000) // 5 seconds
    })

    it('should consistently return same version', async () => {
      const response1 = await GET()
      const data1 = await parseJsonResponse(response1)
      
      const response2 = await GET()
      const data2 = await parseJsonResponse(response2)

      expect(data1.version).toBe(data2.version)
      expect(data1.version).toBe('1.0.0')
    })

    it('should handle multiple concurrent health checks', async () => {
      // Test concurrent requests
      const promises = Array(5).fill(null).map(() => GET().then(parseJsonResponse))
      const results = await Promise.all(promises)

      results.forEach((data) => {
        expect(data.status).toBe('healthy')
        expect(data.database).toBe('connected')
        expect(data.version).toBe('1.0.0')
      })
    })
  })
})