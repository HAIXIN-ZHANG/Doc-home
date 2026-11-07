import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PHOTO_DIMENSION = 2048;

function pixelValue({ value }: TransformFnParams): number {
  // Reject repeated parameters, decimals and coercions such as empty strings or 1e3.
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : Number.NaN;
}

export class PhotoSizeQueryDto {
  /** Maximum width in pixels; omit both w/h to return the original bytes. */
  @IsOptional()
  @Transform(pixelValue)
  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_DIMENSION)
  w?: number;

  /** Maximum height in pixels; one dimension is enough to resize proportionally. */
  @IsOptional()
  @Transform(pixelValue)
  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_DIMENSION)
  h?: number;
}
