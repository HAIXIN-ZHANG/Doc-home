import { BadRequestException, HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export const CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function partLength(size: number, part: number): number {
  if (!Number.isSafeInteger(part) || part < 0 || part >= Math.ceil(size / CHUNK_BYTES)) throw new BadRequestException('Invalid part number');
  return Math.min(CHUNK_BYTES, size - part * CHUNK_BYTES);
}
export class InvalidVideo extends Error {}
// Limited ISO BMFF validation, not a decoder or a codec compatibility guarantee.
export function validateMp4(bytes: Buffer): void {
  const boxes = new Set<string>();
  let offset = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) throw new InvalidVideo('Invalid MP4 box header');
    let length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (length === 1) {
      if (bytes.length - offset < 16) throw new InvalidVideo('Invalid extended MP4 box');
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(bytes.length)) throw new InvalidVideo('MP4 box exceeds file');
      length = Number(large); header = 16;
    } else if (length === 0) length = bytes.length - offset;
    if (length < header || offset + length > bytes.length) throw new InvalidVideo('Invalid MP4 box size');
    if (type === 'ftyp' && length < header + 8) throw new InvalidVideo('Invalid MP4 file type');
    boxes.add(type); offset += length;
  }
  if (!boxes.has('ftyp') || !boxes.has('moov') || !boxes.has('mdat')) throw new InvalidVideo('MP4 requires ftyp, moov and mdat boxes');
}
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new HttpException('Requested range is not satisfiable', 416);
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new HttpException('Requested range is not satisfiable', 416);
  start = Math.max(0, start);
  return { start, end };
}
