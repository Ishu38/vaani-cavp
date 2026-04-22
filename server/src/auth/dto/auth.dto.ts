import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../users/user.schema';

export class SignupDto {
  @ApiProperty({ example: 'Dr. Sharma' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'sharma@school.edu.in' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'securePass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ enum: Role, default: Role.TEACHER })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ example: 'Delhi Public School, Patna' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  school?: string;

  @ApiPropertyOptional({ example: 'DPS-PAT-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  schoolId?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'sharma@school.edu.in' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'securePass123' })
  @IsString()
  @MaxLength(128)
  password: string;
}
