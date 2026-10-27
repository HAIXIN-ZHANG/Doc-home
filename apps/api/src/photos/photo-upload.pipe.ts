import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { Express } from 'express';
import type {} from 'multer';
import type { PhotoMimeType } from '../assets/file-detail.entity.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface PhotoUpload {
  originalName: string;
  mimeType: PhotoMimeType;
  buffer: Buffer;
}

@Injectable()
export class PhotoUploadPipe implements PipeTransform<Express.Multer.File | undefined, Promise<PhotoUpload>> {
  private readonly fileType = new FileTypeValidator({
    fileType: /^image\/(jpeg|png)$/,
    fallbackToMimetype: false,
    // Persist the detected type, never the client-declared MIME type.
    overrideMimeType: true,
  });

  async transform(file: Express.Multer.File | undefined): Promise<PhotoUpload> {
    if (!file) throw new BadRequestException('One photo in the file field is required');
    if (file.buffer.length === 0) throw new BadRequestException('Photo must not be empty');
    if (file.buffer.length > MAX_PHOTO_BYTES) {
      throw new PayloadTooLargeException('Photo must be 5 MiB or smaller');
    }

    const originalName = file.originalname.trim();
    if (!originalName || originalName.length > 255 || /[\u0000-\u001f\u007f]/.test(originalName)) {
      throw new BadRequestException('Photo filename must contain 1–255 characters without control characters');
    }
    if (!await this.fileType.isValid(file) || (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png')) {
      throw new UnsupportedMediaTypeException('Photo content must be JPEG or PNG');
    }
    return { originalName, mimeType: file.mimetype, buffer: file.buffer };
  }
}
