import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SubmitAnalysisDto {
  @ApiPropertyOptional({ example: 'neutral', enum: ['male', 'female', 'child', 'neutral'] })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ example: 'speaker_001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  speakerId?: string;

  @ApiPropertyOptional({ example: 'Aarav Kumar' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  studentName?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  opensmile?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  speechbrain?: boolean;

  @ApiPropertyOptional({ example: 'auto', description: 'L1 language: auto, bho, hin, ben, ori' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  l1Language?: string;
}

export class SubmitBatchDto {
  @ApiPropertyOptional({ example: 'neutral', enum: ['male', 'female', 'child', 'neutral'] })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ example: 'speaker_001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  speakerId?: string;

  @ApiPropertyOptional({ example: 'Aarav Kumar' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  studentName?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  opensmile?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  speechbrain?: boolean;

  @ApiPropertyOptional({ example: 'auto', description: 'L1 language: auto, bho, hin, ben, ori' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  l1Language?: string;
}

export class SubmitContrastiveDto {
  @ApiPropertyOptional({ example: 'neutral' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiPropertyOptional({ example: 'speaker_001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  speakerId?: string;

  @ApiPropertyOptional({ example: 'Aarav Kumar' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  studentName?: string;

  @ApiPropertyOptional({ example: 'auto', description: 'L1 language: auto, bho, hin, ben, ori' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  l1Language?: string;

  @ApiPropertyOptional({ example: 'L1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelA?: string;

  @ApiPropertyOptional({ example: 'L2 (English)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelB?: string;
}
