import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  async check(): Promise<{ status: 'ok' }> {
    // Readiness includes both dependencies; checking must never create or modify data.
    await Promise.all([this.dataSource.query('SELECT 1'), this.storage.checkConnection()]);
    return { status: 'ok' };
  }
}
