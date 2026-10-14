import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ProjectMemberRole, ProjectStatus } from '@prisma/client';

export class CreateProjectDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(5000)
  description!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  deadline!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  memberIds?: string[];
}

export class UpdateProjectDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  startDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  deadline?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

export class AddProjectMemberDto {
  @IsString()
  userId!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ProjectMemberRole)
  role?: ProjectMemberRole;
}