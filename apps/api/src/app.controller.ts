import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health/health.service.js';

@Controller()
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  health(): Promise<{ status: 'ok' }> {
    return this.healthService.check();
  }
}
