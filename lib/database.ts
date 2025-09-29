import { Pool } from 'pg';
import { User, UserStats } from './types';

export class DatabaseService {
  private static pool: Pool;

  static initialize() {
    this.pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || '5432'),
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    console.log('📊 Database connection initialized');
  }

  static async createUser(sl_uuid: string, username: string, role: string = 'Free'): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert user
      const userResult = await client.query(
        'INSERT INTO users (sl_uuid, username, role) VALUES ($1, $2, $3) RETURNING *',
        [sl_uuid, username, role]
      );
      const user = userResult.rows[0];

      // Create initial stats
      await client.query(
        'INSERT INTO user_stats (user_id, health, hunger, thirst) VALUES ($1, 100, 100, 100)',
        [user.id]
      );

      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getUserByUUID(sl_uuid: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE sl_uuid = $1',
      [sl_uuid]
    );
    return result.rows[0] || null;
  }

  static async getUserStats(sl_uuid: string): Promise<UserStats | null> {
    const result = await this.pool.query(`
      SELECT us.* FROM user_stats us
      JOIN users u ON u.id = us.user_id
      WHERE u.sl_uuid = $1
    `, [sl_uuid]);
    return result.rows[0] || null;
  }

  static async updateUserStats(sl_uuid: string, health: number, hunger: number, thirst: number): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE user_stats 
      SET health = $2, hunger = $3, thirst = $4, last_updated = NOW()
      FROM users u 
      WHERE u.id = user_stats.user_id AND u.sl_uuid = $1
    `, [sl_uuid, health, hunger, thirst]);
    
    return (result.rowCount ?? 0) > 0;
  }

  static async updateLastActive(sl_uuid: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET last_active = NOW() WHERE sl_uuid = $1',
      [sl_uuid]
    );
  }

  static getPool(): Pool {
    return this.pool;
  }
}

// Initialize database connection when module is imported
if (process.env.DB_HOST) {
  DatabaseService.initialize();
}
