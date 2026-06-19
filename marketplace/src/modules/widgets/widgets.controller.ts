import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WidgetsService } from './widgets.service';
import {
  CreateWidgetDto,
  CreateVersionDto,
  QueryWidgetsDto,
  CreateReviewDto,
} from './widgets.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Developer } from '../../entities';

@ApiTags('Widgets')
@Controller('api/widgets')
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get()
  @ApiOperation({ summary: 'List widgets with pagination and filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'widgetType', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false })
  async findAll(@Query() query: QueryWidgetsDto) {
    return this.widgetsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get widget details' })
  async findOne(@Param('id') id: string) {
    return this.widgetsService.findOne(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get widget versions' })
  async findVersions(@Param('id') id: string) {
    return this.widgetsService.findVersions(id);
  }

  @Get(':id/download/:version')
  @ApiOperation({ summary: 'Download widget package' })
  async download(@Param('id') id: string) {
    await this.widgetsService.incrementDownload(id);
    // Return package URL (in production, redirect to signed S3 URL)
    const widget = await this.widgetsService.findOne(id);
    return { downloadUrl: widget.iconUrl ?? '' };
  }

  @Post('submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a new widget' })
  async submit(@Body() dto: CreateWidgetDto, @Req() req: { user: Developer }) {
    return this.widgetsService.create(dto, req.user.id);
  }

  @Post(':id/versions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish new version' })
  async publishVersion(
    @Param('id') id: string,
    @Body() dto: CreateVersionDto,
    @Req() req: { user: Developer },
  ) {
    return this.widgetsService.createVersion(id, dto, req.user.id);
  }

  @Post(':id/reviews')
  @ApiOperation({ summary: 'Add a review' })
  async addReview(@Param('id') id: string, @Body() dto: CreateReviewDto) {
    return this.widgetsService.createReview(id, dto);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'Get widget reviews' })
  async getReviews(@Param('id') id: string) {
    return this.widgetsService.findReviews(id);
  }
}
