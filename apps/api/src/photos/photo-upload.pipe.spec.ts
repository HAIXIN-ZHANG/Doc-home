import { describe, expect, it } from '@jest/globals';
import { PhotoUploadPipe, MAX_PHOTO_BYTES } from './photo-upload.pipe.js';
import { png, uploadFile } from '../../test/photo-fixtures.js';

const pipe = new PhotoUploadPipe();
describe('PhotoUploadPipe', () => {
  it('detects content instead of trusting filename or declared MIME', async () => {
    await expect(pipe.transform(uploadFile({ mimetype: 'text/plain', originalname: 'image.txt' })))
      .resolves.toEqual({ originalName: 'image.txt', mimeType: 'image/png', buffer: png });
  });
  it('detects a JPEG signature', async () => {
    await expect(pipe.transform(uploadFile({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), mimetype: 'text/plain' })))
      .resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });
  it('rejects missing files with 400', async () => {
    await expect(pipe.transform(undefined)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects empty files with 400', async () => {
    await expect(pipe.transform(uploadFile({ buffer: Buffer.alloc(0) }))).rejects.toMatchObject({ status: 400 });
  });
  it('rejects disguised text with 415', async () => {
    await expect(pipe.transform(uploadFile({ buffer: Buffer.from('not an image'), originalname: 'fake.jpg', mimetype: 'image/jpeg' })))
      .rejects.toMatchObject({ status: 415 });
  });
  it('accepts exactly 5 MiB', async () => {
    const buffer = Buffer.alloc(MAX_PHOTO_BYTES);
    png.copy(buffer);
    await expect(pipe.transform(uploadFile({ buffer }))).resolves.toMatchObject({ mimeType: 'image/png' });
  });
  it('rejects larger files with 413', async () => {
    await expect(pipe.transform(uploadFile({ buffer: Buffer.alloc(MAX_PHOTO_BYTES + 1) })))
      .rejects.toMatchObject({ status: 413 });
  });
  it.each(['  ', 'a'.repeat(256), 'bad\nname.png', 'bad\x7fname.png'])('rejects an invalid filename: %p', async (originalname) => {
    await expect(pipe.transform(uploadFile({ originalname }))).rejects.toMatchObject({ status: 400 });
  });
  it('preserves an already-decoded Unicode filename', async () => {
    await expect(pipe.transform(uploadFile({ originalname: '厨房-é-🏠.png' })))
      .resolves.toMatchObject({ originalName: '厨房-é-🏠.png' });
  });
  it('trims the display filename', async () => {
    await expect(pipe.transform(uploadFile({ originalname: ' photo.png ' })))
      .resolves.toMatchObject({ originalName: 'photo.png' });
  });
});
