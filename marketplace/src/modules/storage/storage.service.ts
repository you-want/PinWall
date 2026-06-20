import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, existsSync } from 'fs';
import { Readable } from 'stream';

export interface StorageAdapter {
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * 本地文件存储适配器
 */
class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly basePath: string) {}

  private fullPath(key: string): string {
    return path.join(this.basePath, key);
  }

  async upload(key: string, data: Buffer): Promise<string> {
    const fp = this.fullPath(key);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, data);
    return `/uploads/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    const fp = this.fullPath(key);
    if (!existsSync(fp)) {
      throw new NotFoundException(`File not found: ${key}`);
    }
    return fs.readFile(fp);
  }

  getSignedUrl(key: string): Promise<string> {
    return Promise.resolve(`/uploads/${key}`);
  }

  async delete(key: string): Promise<void> {
    const fp = this.fullPath(key);
    if (existsSync(fp)) {
      await fs.unlink(fp);
    }
  }

  exists(key: string): Promise<boolean> {
    return Promise.resolve(existsSync(this.fullPath(key)));
  }

  /** 获取文件流（用于大文件下载） */
  getStream(key: string): Readable {
    const fp = this.fullPath(key);
    if (!existsSync(fp)) {
      throw new NotFoundException(`File not found: ${key}`);
    }
    return createReadStream(fp);
  }
}

/**
 * S3 存储适配器
 * 生产环境使用，通过环境变量配置
 */
class S3StorageAdapter implements StorageAdapter {
  private readonly bucket: string;
  private readonly region: string;
  private readonly logger = new Logger(S3StorageAdapter.name);

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? 'pinwall-widgets';
    this.region = process.env.S3_REGION ?? 'us-east-1';
    this.logger.log(
      `S3 adapter initialized: bucket=${this.bucket}, region=${this.region}`,
    );
  }

  async upload(
    key: string,
    data: Buffer,
    contentType?: string,
  ): Promise<string> {
    // In production, use AWS SDK:
    // const s3 = new S3Client({...});
    // await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    this.logger.log(
      `[S3] Upload: ${key} (${data.length} bytes, ${contentType ?? 'application/octet-stream'})`,
    );
    return this.getSignedUrl(key);
  }

  download(key: string): Promise<Buffer> {
    this.logger.log(`[S3] Download: ${key}`);
    // In production: const result = await s3.send(new GetObjectCommand({...}));
    return Promise.reject(
      new NotFoundException(
        `S3 download not yet implemented. Configure AWS SDK credentials.`,
      ),
    );
  }

  getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    // In production: use getSignedUrl from @aws-sdk/s3-request-presigner
    this.logger.log(`[S3] Signed URL: ${key} (expires in ${expiresIn}s)`);
    return Promise.resolve(
      `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}?signed=true&expires=${expiresIn}`,
    );
  }

  delete(key: string): Promise<void> {
    this.logger.log(`[S3] Delete: ${key}`);
    // In production: await s3.send(new DeleteObjectCommand({...}));
    return Promise.resolve();
  }

  exists(key: string): Promise<boolean> {
    this.logger.log(`[S3] Exists: ${key}`);
    // In production: await s3.send(new HeadObjectCommand({...}));
    return Promise.resolve(false);
  }
}

/**
 * 统一存储服务
 * 根据 STORAGE_TYPE 环境变量选择 local 或 s3 适配器
 */
@Injectable()
export class StorageService {
  private readonly adapter: StorageAdapter;
  private readonly logger = new Logger(StorageService.name);
  private readonly storageType: string;

  constructor() {
    this.storageType = process.env.STORAGE_TYPE ?? 'local';

    if (this.storageType === 's3') {
      this.adapter = new S3StorageAdapter();
    } else {
      const basePath = process.env.STORAGE_LOCAL_PATH ?? './uploads';
      this.adapter = new LocalStorageAdapter(basePath);
    }

    this.logger.log(`Storage initialized: type=${this.storageType}`);
  }

  /** 上传 Widget 包 (.pwx) */
  async uploadWidgetPackage(
    widgetId: string,
    version: string,
    data: Buffer,
  ): Promise<{ url: string; size: number }> {
    const key = `widgets/${widgetId}/${version}/package.pwx`;
    const url = await this.adapter.upload(key, data, 'application/zip');
    return { url, size: data.length };
  }

  /** 上传 Widget 图标 */
  async uploadWidgetIcon(
    widgetId: string,
    data: Buffer,
    ext: string,
  ): Promise<string> {
    const key = `widgets/${widgetId}/icon.${ext}`;
    return this.adapter.upload(key, data, `image/${ext}`);
  }

  /** 上传 Widget 截图 */
  async uploadWidgetScreenshot(
    widgetId: string,
    index: number,
    data: Buffer,
    ext: string,
  ): Promise<string> {
    const key = `widgets/${widgetId}/screenshot-${index}.${ext}`;
    return this.adapter.upload(key, data, `image/${ext}`);
  }

  /** 下载 Widget 包 */
  async downloadWidgetPackage(
    widgetId: string,
    version: string,
  ): Promise<Buffer> {
    const key = `widgets/${widgetId}/${version}/package.pwx`;
    return this.adapter.download(key);
  }

  /** 获取包下载签名 URL */
  async getPackageUrl(
    widgetId: string,
    version: string,
    expiresIn = 3600,
  ): Promise<string> {
    const key = `widgets/${widgetId}/${version}/package.pwx`;
    return this.adapter.getSignedUrl(key, expiresIn);
  }

  /** 删除 Widget 包 */
  async deleteWidgetPackage(widgetId: string, version: string): Promise<void> {
    const key = `widgets/${widgetId}/${version}/package.pwx`;
    return this.adapter.delete(key);
  }

  /** 检查包是否存在 */
  async packageExists(widgetId: string, version: string): Promise<boolean> {
    const key = `widgets/${widgetId}/${version}/package.pwx`;
    return this.adapter.exists(key);
  }

  /** 获取本地文件流（仅 local 模式） */
  getFileStream(key: string): Readable | null {
    if (this.storageType !== 'local') return null;
    return (this.adapter as LocalStorageAdapter).getStream(key);
  }

  /** 获取存储类型 */
  getStorageType(): string {
    return this.storageType;
  }
}
