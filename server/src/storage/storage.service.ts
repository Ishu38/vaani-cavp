import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

/**
 * Cloudflare R2 storage adapter (S3-compatible).
 *
 * Required env (set on the gateway, never committed):
 *   R2_ACCOUNT_ID         — Cloudflare account id
 *   R2_ACCESS_KEY_ID      — R2 token's access key
 *   R2_SECRET_ACCESS_KEY  — R2 token's secret
 *   R2_BUCKET             — bucket name (e.g. "vaani-avatars")
 *   R2_PUBLIC_BASE        — public CDN/dev URL prefix (e.g. "https://avatars.vaaani.in"
 *                           or the bucket's r2.dev address). Required so we can
 *                           hand a usable URL back to the SPA.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private _client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  private get client(): S3Client {
    if (this._client) return this._client;
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'R2 storage is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).',
      );
    }
    this._client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this._client;
  }

  private get bucket(): string {
    const b = this.config.get<string>('R2_BUCKET');
    if (!b) throw new InternalServerErrorException('R2_BUCKET is not configured');
    return b;
  }

  private get publicBase(): string {
    const b = this.config.get<string>('R2_PUBLIC_BASE');
    if (!b) throw new InternalServerErrorException('R2_PUBLIC_BASE is not configured');
    return b.replace(/\/+$/, '');
  }

  private extFromMime(mime: string): string {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  /** Upload an avatar to R2 under avatars/{userId}/{hash}.{ext} and return its
   *  public URL. The hash in the key is a cache-buster — replacing your avatar
   *  produces a new URL so CDN caches don't serve the stale one. */
  async uploadAvatar(userId: string, body: Buffer, mime: string): Promise<string> {
    const ext = this.extFromMime(mime);
    const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
    const key = `avatars/${userId}/${hash}.${ext}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: mime,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (err: any) {
      this.logger.error(`R2 avatar upload failed: ${err?.message || err}`);
      throw new InternalServerErrorException('Avatar upload failed');
    }
    return `${this.publicBase}/${key}`;
  }
}
