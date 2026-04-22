import { IsString, IsEmail, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentType } from './consent.schema';

export class RequestConsentDto {
  @ApiProperty({ example: 'speaker_001' })
  @IsString()
  studentSpeakerId: string;

  @ApiProperty({ example: 'parent@example.com' })
  @IsEmail()
  parentEmail: string;

  @ApiProperty({ example: 'Rajesh Kumar' })
  @IsString()
  parentName: string;

  @ApiPropertyOptional({
    enum: ConsentType,
    isArray: true,
    example: ['audio_recording', 'voice_analysis', 'data_storage', 'report_sharing'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ConsentType, { each: true })
  consentTypes?: ConsentType[];
}

export class VerifyConsentDto {
  @ApiProperty()
  @IsString()
  token: string;
}
