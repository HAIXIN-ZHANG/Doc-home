import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from './database-options.js';

// CLI scripts load .env via Node's --env-file-if-exists; no Nest or S3 bootstrap is needed.
export default new DataSource(createDatabaseOptions(process.env.DATABASE_URL));
