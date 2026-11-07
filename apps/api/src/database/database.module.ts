import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Environment } from '../config/environment.js';
import { createDatabaseOptions } from './database-options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        createDatabaseOptions(config.get('DATABASE_URL', { infer: true })),
    }),
  ],
})
export class DatabaseModule {}
