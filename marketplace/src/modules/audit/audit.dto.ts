import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WidgetStatus } from '../../entities';

export class ManualReviewDto {
  @ApiProperty({
    enum: [WidgetStatus.APPROVED, WidgetStatus.REJECTED],
    description: 'Final review decision',
  })
  @IsEnum([WidgetStatus.APPROVED, WidgetStatus.REJECTED])
  status: WidgetStatus.APPROVED | WidgetStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Reviewer comment' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({
    description: 'Rejection reason (required when rejecting)',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class RunAuditDto {
  @ApiPropertyOptional({ description: 'Widget source code to scan' })
  @IsOptional()
  @IsString()
  sourceCode?: string;
}
