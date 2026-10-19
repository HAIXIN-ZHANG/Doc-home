export interface Environment {
  DATABASE_URL: string;
  PORT: number;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
}

/** Fail startup on invalid configuration; error messages name keys, never secret values. */
export function validateEnvironment(input: Record<string, unknown>): Environment {
  function required(name: string): string {
    const value = input[name];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Configuration error: ${name} is required`);
    }
    return value;
  }

  function url(name: string, protocols: string[]): string {
    const value = required(name);
    try {
      const parsed = new URL(value);
      if (!protocols.includes(parsed.protocol) || !parsed.hostname) {
        throw new Error('Invalid protocol or host');
      }
    } catch {
      // Do not include the value: database URLs can contain credentials.
      throw new Error(`Configuration error: ${name} must be a valid ${protocols.join('/')} URL`);
    }
    return value;
  }

  const rawPort = input.PORT ?? '3001';
  const port = typeof rawPort === 'string' && /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Configuration error: PORT must be an integer from 1 to 65535');
  }

  const bucket = required('S3_BUCKET');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('Configuration error: S3_BUCKET must be 3–63 lowercase letters, digits or hyphens');
  }

  return {
    DATABASE_URL: url('DATABASE_URL', ['postgres:', 'postgresql:']),
    PORT: port,
    S3_ENDPOINT: url('S3_ENDPOINT', ['http:', 'https:']),
    S3_REGION: required('S3_REGION'),
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: required('S3_ACCESS_KEY_ID'),
    S3_SECRET_ACCESS_KEY: required('S3_SECRET_ACCESS_KEY'),
  };
}
