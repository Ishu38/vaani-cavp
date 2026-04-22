import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeletionRequestDto {
  @ApiProperty({ example: 'speaker_001' })
  @IsString()
  studentSpeakerId: string;
}
