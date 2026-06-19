import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WidgetCategory, WidgetType } from '../../entities';

export class CreateWidgetDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  slug: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  author?: string;

  @ApiProperty({ enum: WidgetCategory })
  @IsEnum(WidgetCategory)
  category: WidgetCategory;

  @ApiProperty({ enum: WidgetType })
  @IsEnum(WidgetType)
  widgetType: WidgetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  manifest?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  screenshots?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homepageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  repositoryUrl?: string;
}

export class CreateVersionDto {
  @ApiProperty()
  @IsString()
  version: string;

  @ApiProperty()
  @IsString()
  packageUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  manifest?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  changelog?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  packageSize?: number;
}

export class QueryWidgetsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: WidgetCategory })
  @IsOptional()
  @IsEnum(WidgetCategory)
  category?: WidgetCategory;

  @ApiPropertyOptional({ enum: WidgetType })
  @IsOptional()
  @IsEnum(WidgetType)
  widgetType?: WidgetType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 'downloads' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'downloads';

  @ApiPropertyOptional({ default: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userName?: string;
}
