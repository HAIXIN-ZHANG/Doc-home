import type { PhotoMimeType } from '../entities/photo.entity.js';

export interface ProjectResponseDto {
  id: string;
  name: string;
  address: string;
}

export interface PhotoResponseDto {
  id: string;
  originalName: string;
  mimeType: PhotoMimeType;
  sizeBytes: number;
  createdAt: string;
}

export interface ProjectPhotosResponseDto {
  project: ProjectResponseDto;
  photos: PhotoResponseDto[];
}
