import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity.js';
import type { ProjectPhotosResponseDto } from './dto/project-photos-response.dto.js';
import { Photo } from './entities/photo.entity.js';

@Injectable()
export class PhotosService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Photo) private readonly photos: Repository<Photo>,
  ) {}

  async getProjectPhotos(projectId: string): Promise<ProjectPhotosResponseDto> {
    const project = await this.projects.findOne({
      where: { id: projectId },
      select: { id: true, name: true, address: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Query failures must propagate: an empty array means the query succeeded.
    const photos = await this.photos.find({
      where: { projectId },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return {
      project: { id: project.id, name: project.name, address: project.address },
      photos: photos.map((photo) => ({
        id: photo.id,
        originalName: photo.originalName,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        createdAt: photo.createdAt.toISOString(),
      })),
    };
  }
}
