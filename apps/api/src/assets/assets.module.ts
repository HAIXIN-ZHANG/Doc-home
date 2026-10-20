import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsModule } from '../projects/projects.module.js';
import { Asset } from './asset.entity.js';
import { FileDetail } from './file-detail.entity.js';
import { LinkDetail } from './link-detail.entity.js';
import { AssetsService } from './assets.service.js';

@Module({ imports: [ProjectsModule, TypeOrmModule.forFeature([Asset, FileDetail, LinkDetail])], providers: [AssetsService], exports: [AssetsService] })
export class AssetsModule {}
