import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Environment } from '../config/environment.js';

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
      requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
    });
  }

  // Provision buckets outside the API; readiness must never create or mutate data.
  async checkConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  // Keep the original bytes; optional resizing belongs to reads, not stored variants.
  async putPhoto(key: string, buffer: Buffer, contentType: 'image/jpeg' | 'image/png'): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
  }

  async getPhoto(key: string, maxBytes: number): Promise<Buffer | undefined> {
    let object;
    try {
      object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // Missing bytes are distinct from access, bucket or connectivity failures.
      if (error instanceof NoSuchKey) return undefined;
      throw error;
    }
    const body = object.Body;
    if (!(body instanceof Readable)) throw new Error('Photo storage returned no readable body');

    // Finish the bounded read before sending 200, so stream failures remain HTTP errors.
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
        throw new Error('Stored photo exceeds the allowed byte limit');
      }
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new Error('Stored photo exceeds the allowed byte limit');
        chunks.push(Buffer.from(chunk));
      }
      if (size === 0) throw new Error('Stored photo is empty');
      return Buffer.concat(chunks, size);
    } finally {
      body.destroy();
    }
  }

  async deletePhoto(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
