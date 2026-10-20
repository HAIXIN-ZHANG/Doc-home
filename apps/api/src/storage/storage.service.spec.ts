import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { mockClient } from 'aws-sdk-client-mock';

import type { Environment } from '../config/environment.js';
import { STORAGE_OPERATION_TIMEOUT_MS, StorageService } from './storage.service.js';

// AWS commands are intercepted in-process; these tests never contact S3/S3Mock.
const s3 = mockClient(S3Client);
let service: StorageService;
function body(stream: Readable): GetObjectCommandOutput['Body'] {
  // The implementation only consumes Node's Readable surface, not SDK mixin methods.
  return stream as GetObjectCommandOutput['Body'];
}
beforeEach(() => {
  s3.reset();
  service = new StorageService(
    new ConfigService<Environment, true>({
      S3_ENDPOINT: 'http://localhost:9090',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'test-assets',
      S3_ACCESS_KEY_ID: 'dummy',
      S3_SECRET_ACCESS_KEY: 'dummy',
    }),
  );
});
afterEach(() => {
  service.onModuleDestroy();
});
afterAll(() => {
  s3.restore();
});

describe('StorageService', () => {
  it('checks bucket readiness without provisioning data', async () => {
    s3.on(HeadBucketCommand).resolves({});
    await service.checkConnection();
    expect(s3.commandCalls(HeadBucketCommand)[0]?.args[0].input).toEqual({ Bucket: 'test-assets' });
    expect(s3.calls()).toHaveLength(1);
  });
  it('writes the requested bytes and detected content type', async () => {
    s3.on(PutObjectCommand).resolves({});
    const buffer = Buffer.from('photo');
    await service.putObject('photos/id.png', buffer, 'image/png');
    expect(s3.commandCalls(PutObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: 'test-assets',
      Key: 'photos/id.png',
      Body: buffer,
      ContentType: 'image/png',
    });
  });
  it('deletes by server key', async () => {
    s3.on(DeleteObjectCommand).resolves({});
    await service.deleteObject('photos/id.png');
    expect(s3.commandCalls(DeleteObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: 'test-assets',
      Key: 'photos/id.png',
    });
  });
  it('reads all chunks, allowing the exact byte limit', async () => {
    const stream = Readable.from([Buffer.from('ab'), Buffer.from('cd')]);
    s3.on(GetObjectCommand).resolves({ Body: body(stream), ContentLength: 4 });
    await expect(service.readObjectBuffer('photos/id.png', 4)).resolves.toEqual(
      Buffer.from('abcd'),
    );
    expect(stream.destroyed).toBe(true);
    expect(s3.commandCalls(GetObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: 'test-assets',
      Key: 'photos/id.png',
    });
  });
  it('returns undefined only for a missing object', async () => {
    s3.on(GetObjectCommand).rejects(
      new NoSuchKey({ message: 'Missing object', $metadata: { httpStatusCode: 404 } }),
    );
    await expect(service.readObjectBuffer('missing', 4)).resolves.toBeUndefined();
  });
  it('propagates access or connection failure', async () => {
    const error = new Error('access denied');
    s3.on(GetObjectCommand).rejects(error);
    await expect(service.readObjectBuffer('key', 4)).rejects.toBe(error);
  });
  it('rejects an absent response stream', async () => {
    s3.on(GetObjectCommand).resolves({});
    await expect(service.readObjectBuffer('key', 4)).rejects.toThrow('no readable body');
  });
  it('rejects declared oversized content and destroys the stream', async () => {
    const stream = Readable.from([Buffer.from('abcd')]);
    s3.on(GetObjectCommand).resolves({ Body: body(stream), ContentLength: 10 });
    await expect(service.readObjectBuffer('key', 4)).rejects.toThrow('byte limit');
    expect(stream.destroyed).toBe(true);
  });
  it('enforces the limit even without ContentLength', async () => {
    const stream = Readable.from([Buffer.from('ab'), Buffer.from('cd')]);
    s3.on(GetObjectCommand).resolves({ Body: body(stream) });
    await expect(service.readObjectBuffer('key', 3)).rejects.toThrow('byte limit');
    expect(stream.destroyed).toBe(true);
  });
  it('rejects an empty object', async () => {
    s3.on(GetObjectCommand).resolves({ Body: body(Readable.from([])) });
    await expect(service.readObjectBuffer('key', 4)).rejects.toThrow('empty');
  });
  it('propagates mid-stream failures and releases the stream', async () => {
    const error = new Error('stream interrupted');
    const stream = new Readable({
      read() {
        this.destroy(error);
      },
    });
    s3.on(GetObjectCommand).resolves({ Body: body(stream) });
    await expect(service.readObjectBuffer('key', 4)).rejects.toBe(error);
    expect(stream.destroyed).toBe(true);
  });
  it('passes a deadline signal to every storage command', async () => {
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    s3.on(HeadBucketCommand).resolves({});
    s3.on(PutObjectCommand).resolves({});
    s3.on(DeleteObjectCommand).resolves({});
    s3.on(GetObjectCommand).resolves({ Body: body(Readable.from([Buffer.from('x')])) });
    await service.checkConnection();
    await service.putObject('key', Buffer.from('x'), 'image/png');
    await service.readObjectBuffer('key', 1);
    await service.deleteObject('key');
    expect(timeout).toHaveBeenCalledTimes(4);
    expect(timeout).toHaveBeenCalledWith(STORAGE_OPERATION_TIMEOUT_MS);
    for (const call of s3.calls()) {
      // The mock's tuple type omits SDK handler options, although the call records them.
      const args: readonly unknown[] = call.args;
      expect(args[1]).toEqual({ abortSignal: controller.signal });
    }
  });
  it('aborts a stalled body after response headers and releases the stream', async () => {
    const controller = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const stream = new Readable({
      read() {
        /* Deliberately never yields bytes or EOF. */
      },
    });
    s3.on(GetObjectCommand).resolves({ Body: body(stream) });
    const read = service.readObjectBuffer('key', 4);
    const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    await rejected;
    expect(stream.destroyed).toBe(true);
  });
  it('propagates failed writes and cleanup operations', async () => {
    s3.on(PutObjectCommand).rejects(new Error('put failed'));
    s3.on(DeleteObjectCommand).rejects(new Error('delete failed'));
    await expect(service.putObject('key', Buffer.from('x'), 'image/png')).rejects.toThrow(
      'put failed',
    );
    await expect(service.deleteObject('key')).rejects.toThrow('delete failed');
  });
});

describe('video storage reads', () => {
  it('forwards an exact byte range and returns the readable stream', async () => {
    const stream = Readable.from([Buffer.from('ab')]);
    s3.on(GetObjectCommand).resolves({ Body: body(stream), ContentLength: 2 });
    const result = await service.openObjectStream('videos/id.mp4', { start: 2, end: 3 });
    expect(s3.commandCalls(GetObjectCommand)[0]?.args[0].input).toEqual({
      Bucket: 'test-assets',
      Key: 'videos/id.mp4',
      Range: 'bytes=2-3',
    });
    expect(result).toBe(stream);
    stream.destroy();
  });
  it('retains storage outages as errors and only treats absent objects as missing', async () => {
    s3.on(GetObjectCommand).rejects(new Error('offline'));
    await expect(service.openObjectStream('id')).rejects.toThrow('offline');
    s3.on(GetObjectCommand).rejects(
      new NoSuchKey({ message: 'missing', $metadata: { httpStatusCode: 404 } }),
    );
    await expect(service.openObjectStream('id')).resolves.toBeUndefined();
  });
  it('propagates an attempt cancellation while consuming stored bytes', async () => {
    const stream = new Readable({ read() {} });
    const controller = new AbortController();
    s3.on(GetObjectCommand).resolves({ Body: body(stream) });
    const reading = service.readObjectBuffer('id', 100, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(reading).rejects.toThrow();
    expect(stream.destroyed).toBe(true);
  });
});
