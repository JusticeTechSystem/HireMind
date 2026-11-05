import { BadRequestException, Controller, Delete, Get, Injectable, Module, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { loadEnv } from '@hiremind/config';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { scanBuffer } from '../resumes/scanner';
import { StorageService } from '../resumes/storage';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
/** Type is decided by magic bytes, never by the client's mimetype/extension. SVG/GIF are deliberately unsupported. */
export function detectImage(b: Buffer): { ext: string; mime: string } {
  if (!b.length) throw new BadRequestException('Empty file');
  if (b.length > MAX_AVATAR_BYTES) throw new BadRequestException('Image exceeds 2 MB');
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  throw new BadRequestException('Only PNG, JPEG and WebP images are supported');
}

@Injectable()
export class AvatarService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}
  private bucket() { return loadEnv().SUPABASE_AVATAR_BUCKET; }
  async upload(userId: string, file: { buffer: Buffer }) {
    const t = detectImage(file.buffer);
    if ((await scanBuffer(file.buffer)) === 'infected') throw new BadRequestException('File rejected by malware scan');
    const path = `${userId}/avatar-${Date.now()}.${t.ext}`;
    await this.storage.put(path, file.buffer, t.mime, this.bucket());
    const old = await this.prisma.profile.findUnique({ where: { userId }, select: { avatarPath: true } });
    await this.prisma.profile.upsert({ where: { userId }, create: { userId, avatarPath: path }, update: { avatarPath: path } });
    if (old?.avatarPath) await this.storage.remove(old.avatarPath, this.bucket()).catch(() => undefined);
    return { ok: true };
  }
  async url(userId: string) {
    const p = await this.prisma.profile.findUnique({ where: { userId }, select: { avatarPath: true } });
    return { url: p?.avatarPath ? await this.storage.signedUrl(p.avatarPath, 3600, this.bucket()) : null };
  }
  async remove(userId: string) {
    const p = await this.prisma.profile.findUnique({ where: { userId }, select: { avatarPath: true } });
    if (p?.avatarPath) { await this.storage.remove(p.avatarPath, this.bucket()).catch(() => undefined); await this.prisma.profile.update({ where: { userId }, data: { avatarPath: null } }); }
    return { ok: true };
  }
}

@Controller('profiles/me/avatar')
@UseGuards(AuthGuard, RolesGuard)
export class AvatarController {
  constructor(private svc: AvatarService) {}
  @Get() url(@CurrentUser() u: AuthUser) { return this.svc.url(u.id); }
  @Post() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() f?: { buffer: Buffer }) { if (!f) throw new BadRequestException('file is required'); return this.svc.upload(u.id, f); }
  @Delete() remove(@CurrentUser() u: AuthUser) { return this.svc.remove(u.id); }
}

@Module({ controllers: [AvatarController], providers: [AvatarService, StorageService] })
export class AvatarModule {}
