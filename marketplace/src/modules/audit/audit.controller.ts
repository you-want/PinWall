import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { ManualReviewDto, RunAuditDto } from './audit.dto';
import { WidgetsService } from '../widgets/widgets.service';
import { WidgetStatus } from '../../entities';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Audit')
@Controller('api/admin/audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly widgetsService: WidgetsService,
  ) {}

  @Get('queue')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending review queue' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPendingQueue(@Query('page') page = 1, @Query('limit') limit = 20) {
    const { items, total } = await this.widgetsService.findAllForAdmin({
      page,
      limit,
    });
    const pending = items.filter((w) => w.status === WidgetStatus.PENDING);
    return {
      items: pending,
      total: pending.length,
      queueSize: total,
      page,
      limit,
    };
  }

  @Post(':widgetId/run')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Run automated audit on a widget',
    description: 'Runs security scanning and manifest compliance check',
  })
  async runAudit(
    @Param('widgetId') widgetId: string,
    @Body() dto: RunAuditDto,
  ) {
    const widget = await this.widgetsService.findOne(widgetId);
    return this.auditService.auditWidget(widget, dto.sourceCode);
  }

  @Post(':widgetId/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Manual review decision',
    description: 'Approve or reject a widget with reviewer comments',
  })
  async manualReview(
    @Param('widgetId') widgetId: string,
    @Body() dto: ManualReviewDto,
  ) {
    if (dto.status === WidgetStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException(
        'rejectionReason is required when rejecting a widget',
      );
    }

    const widget = await this.widgetsService.updateStatus(widgetId, dto.status);

    return {
      widget,
      reviewDecision: {
        status: dto.status,
        comment: dto.comment,
        rejectionReason: dto.rejectionReason,
        reviewedAt: new Date().toISOString(),
      },
    };
  }

  @Post('batch-audit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Run automated audit on all pending widgets' })
  async batchAudit() {
    const { items } = await this.widgetsService.findAllForAdmin({
      page: 1,
      limit: 100,
    });
    const pending = items.filter((w) => w.status === WidgetStatus.PENDING);
    return this.auditService.auditPendingQueue(pending);
  }
}
