import {
  Controller,
  Get,
  Post,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Admin')
@Controller('api/admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── 开发者管理 ────────────────────────────

  @Get('developers')
  @ApiOperation({ summary: 'List all developers' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listDevelopers(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminService.listDevelopers(page, limit);
  }

  @Get('developers/:id')
  @ApiOperation({ summary: 'Get developer details' })
  async getDeveloper(@Param('id') id: string) {
    return this.adminService.getDeveloper(id);
  }

  @Post('developers/:id/verify')
  @ApiOperation({ summary: 'Verify a developer' })
  async verifyDeveloper(@Param('id') id: string) {
    return this.adminService.verifyDeveloper(id);
  }

  @Post('developers/:id/unverify')
  @ApiOperation({ summary: 'Unverify a developer' })
  async unverifyDeveloper(@Param('id') id: string) {
    return this.adminService.unverifyDeveloper(id);
  }

  @Delete('developers/:id')
  @ApiOperation({ summary: 'Delete a developer' })
  async deleteDeveloper(@Param('id') id: string) {
    return this.adminService.deleteDeveloper(id);
  }

  // ── 数据统计看板 ────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('stats/categories')
  @ApiOperation({ summary: 'Get category-level statistics' })
  async getCategoryStats() {
    return this.adminService.getCategoryStats();
  }

  @Get('stats/top-widgets')
  @ApiOperation({ summary: 'Get top downloaded widgets' })
  @ApiQuery({ name: 'limit', required: false })
  async getTopWidgets(@Query('limit') limit = 10) {
    return this.adminService.getTopWidgets(limit);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get recent activity feed' })
  @ApiQuery({ name: 'limit', required: false })
  async getRecentActivity(@Query('limit') limit = 20) {
    return this.adminService.getRecentActivity(limit);
  }
}
