import { IsString, IsOptional, IsEmail, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Gender, L1Language } from './student.schema';

export class CreateClassroomDto {
  @ApiProperty({ example: 'Class 5A' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '2025-26' })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ example: '5' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  section?: string;
}

export class UpdateClassroomDto extends PartialType(CreateClassroomDto) {}

export class CreateStudentDto {
  @ApiProperty({ example: 'Aarav Kumar' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'speaker_001' })
  @IsString()
  speakerId: string;

  @ApiPropertyOptional({ example: 'parent@example.com' })
  @IsOptional()
  @IsEmail()
  parentEmail?: string;

  @ApiPropertyOptional({ example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  parentPhone?: string;

  @ApiPropertyOptional({ example: '2015-06-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: L1Language, default: L1Language.BHO })
  @IsOptional()
  @IsEnum(L1Language)
  l1Language?: L1Language;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}
