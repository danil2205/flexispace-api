import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, Inject, Logger } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Cache } from 'cache-manager';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle()
  check() {
    const isTest = process.env.NODE_ENV === 'test';
    const heapLimit = isTest ? 3 * 1024 * 1024 * 1024 : 300 * 1024 * 1024;

    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1000 }),
      () =>
        this.disk.checkStorage('storage', {
          thresholdPercent: 0.9,
          path: process.platform === 'win32' ? 'C:\\' : '/',
        }),
      () => this.memory.checkHeap('memory_heap', heapLimit),
      async () => {
        const indicator = this.healthIndicatorService.check('redis');
        try {
          await this.cache.set('health_check', 'ok', 1000);
          return indicator.up();
        } catch (err) {
          this.logger.error('Redis health check failed', err);
          return indicator.down({ message: 'Redis check failed' });
        }
      },
    ]);
  }
}
