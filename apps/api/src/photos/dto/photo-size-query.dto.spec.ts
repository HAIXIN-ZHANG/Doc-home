import { describe, expect, it } from '@jest/globals';
import { ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { PhotoSizeQueryDto } from './photo-size-query.dto.js';
import { projectId } from '../../../test/photo-fixtures.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const transform = (input: Record<string, unknown>): Promise<PhotoSizeQueryDto> =>
  pipe.transform(input, { type: 'query', metatype: PhotoSizeQueryDto }) as Promise<PhotoSizeQueryDto>;

describe('Photo size request validation', () => {
  it.each([{}, { w: '300' }, { h: '300' }, { w: '1', h: '2048' }])('accepts optional valid dimensions: %p', async (input) => {
    const result = await transform(input);
    expect(result).toBeInstanceOf(PhotoSizeQueryDto);
    if (input.w) expect(result.w).toBe(Number(input.w));
    if (input.h) expect(result.h).toBe(Number(input.h));
  });
  it.each(['', '0', '-1', '1.5', '2049', 'abc', '1e3', 'Infinity', ['300', '400']])
  ('rejects invalid width with 400: %p', async (w) => {
    await expect(transform({ w })).rejects.toMatchObject({ status: 400 });
  });
  it.each(['', '0', '-1', '2049', ['100', '200']])('rejects invalid height with 400: %p', async (h) => {
    await expect(transform({ h })).rejects.toMatchObject({ status: 400 });
  });
  it('rejects unknown query parameters', async () => {
    await expect(transform({ quality: '80' })).rejects.toMatchObject({ status: 400 });
  });
  it('accepts UUIDs and rejects malformed route IDs', async () => {
    const uuid = new ParseUUIDPipe();
    await expect(uuid.transform(projectId, { type: 'param' })).resolves.toBe(projectId);
    await expect(uuid.transform('bad-id', { type: 'param' })).rejects.toMatchObject({ status: 400 });
  });
});
