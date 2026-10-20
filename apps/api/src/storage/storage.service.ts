import { addAbortSignal, Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../config/environment.js';

// One budget covers SDK retries and consuming a response body.
export const STORAGE_OPERATION_TIMEOUT_MS = 10_000;

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Environment, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      // The local emulator uses /bucket/key rather than bucket.endpoint/key.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
      maxAttempts: 2,
      requestHandler: {
        connectionTimeout: 2000,
        requestTimeout: 5000,
        throwOnRequestTimeout: true,
      },
    });
  }

  // Provision buckets outside the API; readiness must never create or mutate data.
  async checkConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(STORAGE_OPERATION_TIMEOUT_MS),
    });
  }

  // Storage owns byte transport; media validation and resizing belong to feature services.
  async putObject(
    key: string,
    buffer: Buffer,
    contentType: string,
    attemptSignal?: AbortSignal,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
      {
        abortSignal: attemptSignal
          ? AbortSignal.any([attemptSignal, AbortSignal.timeout(STORAGE_OPERATION_TIMEOUT_MS)])
          : AbortSignal.timeout(STORAGE_OPERATION_TIMEOUT_MS),
      },
    );
  }

  async readObjectBuffer(
    key: string,
    maxBytes: number,
    attemptSignal?: AbortSignal,
  ): Promise<Buffer | undefined> {
    const signal = attemptSignal
      ? AbortSignal.any([attemptSignal, AbortSignal.timeout(STORAGE_OPERATION_TIMEOUT_MS)])
      : AbortSignal.timeout(STORAGE_OPERATION_TIMEOUT_MS);
    let object;
    try {
      object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        abortSignal: signal,
      });
    } catch (error) {
      // Missing bytes are distinct from access, bucket or connectivity failures.
      if (error instanceof NoSuchKey) return undefined;
      throw error;
    }
    const body = object.Body;
    if (!(body instanceof Readable)) throw new Error('Object storage returned no readable body');
    // Response headers arriving does not mean the body has finished.
    addAbortSignal(signal, body);

    // Finish the bounded read before sending 200, so stream failures remain HTTP errors.
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
        throw new Error('Stored object exceeds the allowed byte limit');
      }
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new Error('Stored object exceeds the allowed byte limit');
        chunks.push(Buffer.from(chunk));
      }
      if (size === 0) throw new Error('Stored object is empty');
      return Buffer.concat(chunks, size);
    } finally {
      body.destroy();
    }
  }

  async openObjectStream(
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable | undefined> {
    const signal = AbortSignal.timeout(STORAGE_OPERATION_TIMEOUT_MS);
    try {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
        { abortSignal: signal },
      );
      if (!(object.Body instanceof Readable))
        throw new Error('Object storage returned no readable body');
      return addAbortSignal(signal, object.Body);
    } catch (error) {
      if (error instanceof NoSuchKey) return undefined;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(STORAGE_OPERATION_TIMEOUT_MS),
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
