import { VideosModule } from './videos/videos.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { AssetsController } from './assets/assets.controller.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthService } from './health/health.service.js';
import { PhotosModule } from './photos/photos.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnvironment }),
    DatabaseModule,
    ProjectsModule,
    PhotosModule,
    AssetsModule,
    StorageModule,
    VideosModule,
  ],
  controllers: [AppController, AssetsController],
  providers: [HealthService],
})
export class AppModule {}
