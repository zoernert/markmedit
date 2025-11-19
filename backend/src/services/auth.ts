import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import type { User } from '../db/schema.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 10;

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  static async register(
    username: string,
    email: string,
    password: string,
    display_name?: string
  ): Promise<LoginResponse> {
    const db = getDatabase();
    
    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);

    if (existing) {
      throw new Error('User already exists');
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Create user
    const id = randomUUID();
    const now = new Date().toISOString();
    
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, display_name, created_at, updated_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(id, username, email, password_hash, display_name || username, now, now);

    // Add to LOGGED_IN group
    db.prepare(
      `INSERT INTO user_groups (user_id, group_id, added_at) VALUES (?, '_LOGGED_IN', ?)`
    ).run(id, now);

    const user: AuthUser = {
      id,
      username,
      email,
      display_name: display_name || username,
    };

    // Generate token
    const token = jwt.sign(
      { userId: id, username, email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    return { user, token };
  }

  /**
   * Login user
   */
  static async login(username: string, password: string): Promise<LoginResponse> {
    const db = getDatabase();
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as User | undefined;

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    // Create session
    const sessionId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    db.prepare(
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, user.id, token, expiresAt.toISOString(), new Date().toISOString());

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
      },
      token,
    };
  }

  /**
   * Verify JWT token
   */
  static async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
      
      const db = getDatabase();
      const user = db.prepare(
        'SELECT id, username, email, display_name FROM users WHERE id = ? AND is_active = 1'
      ).get(decoded.userId) as User | undefined;

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Logout user (invalidate session)
   */
  static async logout(token: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<AuthUser | null> {
    const db = getDatabase();
    const user = db.prepare(
      'SELECT id, username, email, display_name FROM users WHERE id = ? AND is_active = 1'
    ).get(userId) as User | undefined;

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
    };
  }

  /**
   * Update user profile
   */
  static async updateProfile(
    userId: string,
    updates: { display_name?: string; email?: string }
  ): Promise<AuthUser> {
    const db = getDatabase();
    
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.display_name) {
      fields.push('display_name = ?');
      values.push(updates.display_name);
    }

    if (updates.email) {
      fields.push('email = ?');
      values.push(updates.email);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(userId);

    db.prepare(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values);

    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Change password
   */
  static async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const db = getDatabase();
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
    if (!user) {
      throw new Error('User not found');
    }

    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      throw new Error('Invalid old password');
    }

    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.prepare(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?'
    ).run(password_hash, new Date().toISOString(), userId);
  }
}
