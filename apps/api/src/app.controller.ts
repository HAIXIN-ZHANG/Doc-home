import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from './storage/storage.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    // This is readiness for both dependencies, not just a process-alive check.
    await Promise.all([this.dataSource.query('SELECT 1'), this.storage.checkConnection()]);
    return { status: 'ok' };
  }
}
