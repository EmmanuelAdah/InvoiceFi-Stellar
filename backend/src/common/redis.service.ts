import { Injectable, Logger, Inject, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface IdempotencyRecord {
  response: any;
  statusCode: number;
  userId: string;
  createdAt: number;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Get a value from Redis
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a value in Redis with optional TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Set if not exists (for idempotency)
   */
  async setIfNotExists(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    const serialized = JSON.stringify(value);
    const result = await this.client.set(key, serialized, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Get TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    return this.client.ttl(key);
  }
}
