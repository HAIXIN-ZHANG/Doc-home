import { describe, expect, it } from '@jest/globals';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUploadDto } from './create-upload.dto.js';
import { byteRange, CHUNK_BYTES, partLength, sha256, validateMp4 } from './video-policy.js';
describe('video protocol boundaries', () => {
  it('checks exact final length and zero-based bounds', () => {
    expect(partLength(CHUNK_BYTES+4,0)).toBe(CHUNK_BYTES); expect(partLength(CHUNK_BYTES+4,1)).toBe(4);
    for (const part of [-1,2,0.5,NaN]) expect(() => partLength(CHUNK_BYTES+4,part)).toThrow();
  });
  it.each(['bytes=0-9','bytes=0-','bytes=-10','bytes=90-500'])('supports single range %s', header => {
    const range = byteRange(header,100)!; expect(range.start).toBeGreaterThanOrEqual(0); expect(range.end).toBeLessThan(100);
  });
  it.each(['bytes=-0','bytes=100-','bytes=9-2','bytes=0-1,4-5','bytes=9007199254740992-','garbage'])('rejects unsatisfiable/multiple ranges %s', header => expect(() => byteRange(header,100)).toThrow());
  it('checks MP4 top-level sizes and required boxes', () => {
    const box = (type: string, size = 8) => { const bytes = Buffer.alloc(size); bytes.writeUInt32BE(size); bytes.write(type,4); return bytes; };
    const valid = Buffer.concat([box('ftyp',16),box('moov'),box('mdat')]);
    expect(() => validateMp4(valid)).not.toThrow();
    expect(() => validateMp4(valid.subarray(0,-1))).toThrow();
    expect(() => validateMp4(Buffer.from('not mp4'))).toThrow();
    expect(() => validateMp4(box('ftyp',16))).toThrow();
  });
  it('rejects oversized or forged sessions and accepts a bounded MP4 identity', async () => {
    const dto = { fileName:'video.mp4',fileSizeBytes:1,mimeType:'video/mp4',expectedSha256:sha256(Buffer.from('a')) };
    expect(await validate(plainToInstance(CreateUploadDto,dto))).toHaveLength(0);
    for (const override of [{ fileSizeBytes:20971521 },{expectedSha256:'ABC'}, {fileName:'\n.mp4'},{mimeType:'video/webm'}, {fileSizeBytes:0}]) {
      expect((await validate(plainToInstance(CreateUploadDto,{...dto,...override}))).length).toBeGreaterThan(0);
    }
  });
});
