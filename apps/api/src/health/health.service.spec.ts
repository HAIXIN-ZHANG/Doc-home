import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service.js';
import { StorageService } from '../storage/storage.service.js';

const database = { query: jest.fn<(sql: string) => Promise<unknown>>() };
const storage = { checkConnection: jest.fn<StorageService['checkConnection']>() };
let module: TestingModule;
let service: HealthService;
beforeEach(async () => {
  database.query.mockResolvedValue([{ value: 1 }]);
  storage.checkConnection.mockResolvedValue(undefined);
  module = await Test.createTestingModule({ providers: [
    HealthService,
    { provide: DataSource, useValue: database },
    { provide: StorageService, useValue: storage },
  ] }).compile();
  service = module.get(HealthService);
});
afterEach(async () => { await module.close(); });

describe('HealthService', () => {
  it('checks database and storage without writing data', async () => {
    await expect(service.check()).resolves.toEqual({ status: 'ok' });
    expect(database.query).toHaveBeenCalledWith('SELECT 1');
    expect(storage.checkConnection).toHaveBeenCalledTimes(1);
  });
  it('propagates database failure', async () => {
    const error = new Error('database failed');
    database.query.mockRejectedValue(error);
    await expect(service.check()).rejects.toBe(error);
  });
  it('propagates storage failure', async () => {
    const error = new Error('storage failed');
    storage.checkConnection.mockRejectedValue(error);
    await expect(service.check()).rejects.toBe(error);
  });
});
