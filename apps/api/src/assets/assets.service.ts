import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity.js';
import { Asset } from './asset.entity.js';
import { FileDetail } from './file-detail.entity.js';
import { LinkDetail } from './link-detail.entity.js';
import type { CreateLinkDto } from './create-link.dto.js';
import type { AssetResponse, LinkAsset, StoredPhoto } from './asset-response.js';

export function normalizeLink(dto: CreateLinkDto): { url: string; name: string } {
  const input = dto.url.trim();
  if (!input || input.length > 2048) throw new BadRequestException('URL must contain 1–2048 characters');
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw new BadRequestException('Enter a complete HTTP or HTTPS URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new BadRequestException('Use an HTTP or HTTPS URL without credentials');
  }
  const url = parsed.href;
  const name = dto.name?.trim();
  if (url.length > 2048 || (name?.length ?? 0) > 120 || (name && /[\u0000-\u001f\u007f]/.test(name))) {
    throw new BadRequestException('URL or name is too long or contains unsupported characters');
  }
  return { url, name: name || url };
}

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly database: DataSource,
  ) {}

  async getProjectAssets(projectId: string) {
    const project = await this.projects.findOne({ where: { id: projectId }, select: { id: true, name: true, address: true } });
    if (!project) throw new NotFoundException('Project not found');
    const assets = await this.assets.find({ where: { projectId }, relations: { file: true, link: true }, order: { createdAt: 'DESC', id: 'DESC' } });
    return { project: { id: project.id, name: project.name, address: project.address }, assets: assets.map(asset => this.toResponse(asset)) };
  }

  async createLink(projectId: string, dto: CreateLinkDto): Promise<LinkAsset> {
    const target = normalizeLink(dto);
    if (!await this.projects.existsBy({ id: projectId })) throw new NotFoundException('Project not found');
    return this.database.transaction(async manager => {
      const asset = await manager.save(Asset, manager.create(Asset, { id: randomUUID(), projectId, type: 'link', name: target.name }));
      await manager.save(LinkDetail, manager.create(LinkDetail, { assetId: asset.id, url: target.url }));
      return { id: asset.id, projectId, type: 'link', name: asset.name, url: target.url, createdAt: asset.createdAt.toISOString() };
    });
  }

  async findPhotos(projectId: string): Promise<StoredPhoto[]> {
    const records = await this.assets.find({ where: { projectId, type: 'photo' }, relations: { file: true }, order: { createdAt: 'DESC', id: 'DESC' } });
    return records.map(asset => this.toPhoto(asset));
  }

  async findPhoto(projectId: string, id: string): Promise<StoredPhoto | null> {
    const asset = await this.assets.findOne({ where: { id, projectId, type: 'photo' }, relations: { file: true } });
    return asset ? this.toPhoto(asset) : null;
  }

  async findVideo(projectId: string, id: string): Promise<Asset | null> {
    return this.assets.findOne({ where: { id, projectId, type: 'video' }, relations: { file: true } });
  }

  async savePhoto(photo: Omit<StoredPhoto, 'createdAt'>): Promise<StoredPhoto> {
    return this.database.transaction(async manager => {
      const asset = await manager.save(Asset, manager.create(Asset, {
        id: photo.id, projectId: photo.projectId, type: 'photo', name: photo.originalName,
      }));
      await manager.save(FileDetail, manager.create(FileDetail, {
        assetId: photo.id, storageKey: photo.storageKey, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes,
      }));
      return { ...photo, createdAt: asset.createdAt };
    });
  }

  async softDelete(projectId: string, id: string, type?: Asset['type']): Promise<void> {
    const scope = { id, projectId, ...(type ? { type } : {}) };
    const result = await this.assets.update({ ...scope, deletedAt: IsNull() }, { deletedAt: () => 'CURRENT_TIMESTAMP' });
    if (result.affected === 0 && !await this.assets.exists({ where: scope, withDeleted: true })) {
      throw new NotFoundException('Asset not found');
    }
  }

  private toPhoto(asset: Asset): StoredPhoto {
    if (!asset.file || asset.link || !['image/jpeg','image/png'].includes(asset.file.mimeType)) throw new InternalServerErrorException('Asset details are inconsistent');
    return { id: asset.id, projectId: asset.projectId, originalName: asset.name, createdAt: asset.createdAt,
      storageKey: asset.file.storageKey, mimeType: asset.file.mimeType as StoredPhoto['mimeType'], sizeBytes: asset.file.sizeBytes };
  }

  private toResponse(asset: Asset): AssetResponse {
    const base = { id: asset.id, projectId: asset.projectId, name: asset.name, createdAt: asset.createdAt.toISOString() };
    if (asset.type === 'link') {
      if (!asset.link || asset.file) throw new InternalServerErrorException('Asset details are inconsistent');
      return { ...base, type: 'link', url: asset.link.url };
    }
    if (asset.type === 'video') {
      if (!asset.file || asset.link || asset.file.mimeType !== 'video/mp4') throw new InternalServerErrorException('Asset details are inconsistent');
      return { ...base, type: 'video', mimeType: 'video/mp4', sizeBytes: asset.file.sizeBytes, contentUrl: `/projects/${asset.projectId}/assets/${asset.id}/content` };
    }
    const photo = this.toPhoto(asset);
    return { ...base, type: 'photo', mimeType: photo.mimeType, sizeBytes: photo.sizeBytes,
      contentUrl: `/projects/${asset.projectId}/assets/${asset.id}/content` };
  }
}
