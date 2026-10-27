import { describe, expect, it } from '@jest/globals';
import { validateDatabaseUrl, validateEnvironment } from './environment.js';

const valid = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test', PORT: '3001',
  S3_ENDPOINT: 'http://localhost:9090', S3_REGION: 'us-east-1', S3_BUCKET: 'test-assets',
  S3_ACCESS_KEY_ID: 'dummy', S3_SECRET_ACCESS_KEY: 'dummy',
};
describe('environment validation', () => {
  it('returns normalized configuration', () => {
    expect(validateEnvironment(valid)).toEqual({ ...valid, PORT: 3001 });
  });
  it('defaults the API port', () => {
    expect(validateEnvironment({ ...valid, PORT: undefined }).PORT).toBe(3001);
  });
  it.each(['1', '65535'])('accepts valid port boundary %s', (PORT) => {
    expect(validateEnvironment({ ...valid, PORT }).PORT).toBe(Number(PORT));
  });
  it.each(['0', '-1', '65536', '3001.5', '', 'abc'])('rejects invalid port %p', (PORT) => {
    expect(() => validateEnvironment({ ...valid, PORT })).toThrow('PORT');
  });
  it.each(['DATABASE_URL', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])
  ('rejects a missing required value: %s', (key) => {
    expect(() => validateEnvironment({ ...valid, [key]: ' ' })).toThrow(key);
  });
  it.each(['ABucket', 'ab', 'a'.repeat(64), 'has_underscore'])('rejects unsupported bucket names: %p', (S3_BUCKET) => {
    expect(() => validateEnvironment({ ...valid, S3_BUCKET })).toThrow('S3_BUCKET');
  });
  it('does not include invalid database credentials in errors', () => {
    const privateUrl = 'https://user:PRIVATE_PASSWORD@localhost/db';
    expect(() => validateDatabaseUrl(privateUrl)).toThrow('DATABASE_URL');
    try { validateDatabaseUrl(privateUrl); } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_PASSWORD');
    }
  });
  it('rejects unsupported storage endpoint protocols', () => {
    expect(() => validateEnvironment({ ...valid, S3_ENDPOINT: 'ftp://localhost' })).toThrow('S3_ENDPOINT');
  });
});
