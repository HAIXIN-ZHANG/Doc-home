import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateLinkDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 2048) url!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value)
  @IsOptional() @IsString() @Length(1, 120) name?: string;
}
