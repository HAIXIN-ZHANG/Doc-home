import { Equals, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { MAX_VIDEO_BYTES } from './video-policy.js';

export class CreateUploadDto {
  @IsString()
  @MaxLength(255)
  @Matches(/^[^\u0000-\u001f\u007f]*\S[^\u0000-\u001f\u007f]*$/)
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_BYTES)
  fileSizeBytes!: number;

  @Equals('video/mp4')
  mimeType!: 'video/mp4';

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedSha256!: string;
}
