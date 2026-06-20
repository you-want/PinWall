import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

interface UploadedFileData {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('Storage')
@Controller('api/storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('widgets/:id/:version/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload widget package (.pwx)' })
  async uploadPackage(
    @Param('id') id: string,
    @Param('version') version: string,
    @UploadedFile() file: UploadedFileData,
  ) {
    const result = await this.storageService.uploadWidgetPackage(
      id,
      version,
      file.buffer,
    );
    return result;
  }

  @Get('widgets/:id/:version/download')
  @ApiOperation({ summary: 'Download widget package' })
  async downloadPackage(
    @Param('id') id: string,
    @Param('version') version: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const type = this.storageService.getStorageType();

    if (type === 'local') {
      const key = `widgets/${id}/${version}/package.pwx`;
      const stream = this.storageService.getFileStream(key);
      if (stream) {
        res.set({
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${id}-${version}.pwx"`,
        });
        return new StreamableFile(stream);
      }
    }

    // S3: return signed URL for redirect
    const url = await this.storageService.getPackageUrl(id, version);
    return { downloadUrl: url };
  }

  @Post('widgets/:id/icon')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload widget icon' })
  async uploadIcon(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileData,
  ) {
    const ext = file.originalname.split('.').pop() ?? 'png';
    const url = await this.storageService.uploadWidgetIcon(
      id,
      file.buffer,
      ext,
    );
    return { url };
  }

  @Post('widgets/:id/screenshots')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload widget screenshot' })
  async uploadScreenshot(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileData,
    @Query('index') index = 0,
  ) {
    const ext = file.originalname.split('.').pop() ?? 'png';
    const url = await this.storageService.uploadWidgetScreenshot(
      id,
      index,
      file.buffer,
      ext,
    );
    return { url };
  }
}
