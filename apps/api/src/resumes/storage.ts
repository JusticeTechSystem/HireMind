import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '@justiceview/config';
/** Private Supabase Storage. Throws 503 when credentials are absent; never pretends to store. `bucket` defaults to the resume bucket. */
@Injectable()
export class StorageService {
  private cfg(bucket?: string) {
    const e = loadEnv();
    if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceUnavailableException('Storage not configured (awaiting Supabase credentials)');
    return { base: `${e.SUPABASE_URL}/storage/v1`, bucket: bucket ?? e.SUPABASE_RESUME_BUCKET, h: { Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, apikey: e.SUPABASE_SERVICE_ROLE_KEY } };
  }
  async put(path: string, body: Buffer, contentType: string, bucket?: string) {
    const c = this.cfg(bucket);
    const r = await fetch(`${c.base}/object/${c.bucket}/${path}`, { method: 'POST', headers: { ...c.h, 'Content-Type': contentType }, body });
    if (!r.ok) throw new ServiceUnavailableException(`Storage upload failed (${r.status})`);
  }
  async signedUrl(path: string, seconds = 300, bucket?: string): Promise<string> {
    const c = this.cfg(bucket);
    const r = await fetch(`${c.base}/object/sign/${c.bucket}/${path}`, { method: 'POST', headers: { ...c.h, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: seconds }) });
    if (!r.ok) throw new ServiceUnavailableException('Could not sign URL');
    const { signedURL } = (await r.json()) as { signedURL: string };
    return `${c.base}${signedURL}`;
  }
  async remove(path: string, bucket?: string) {
    const c = this.cfg(bucket); await fetch(`${c.base}/object/${c.bucket}/${path}`, { method: 'DELETE', headers: c.h });
  }
}
