import * as net from 'net';
import { loadEnv } from '@justiceview/config';
export type ScanResult = 'clean' | 'infected' | 'skipped';
/** ClamAV clamd INSTREAM. Returns 'skipped' (never 'clean') when no scanner is configured. */
export async function scanBuffer(buf: Buffer): Promise<ScanResult> {
  const { CLAMAV_HOST, CLAMAV_PORT } = loadEnv();
  if (!CLAMAV_HOST) return 'skipped';
  return new Promise((resolve, reject) => {
    const sock = net.connect(CLAMAV_PORT, CLAMAV_HOST);
    let out = ''; sock.setTimeout(15000, () => { sock.destroy(); reject(new Error('scan timeout')); });
    sock.on('error', reject); sock.on('data', (d) => (out += d.toString()));
    sock.on('end', () => resolve(out.includes('FOUND') ? 'infected' : out.includes('OK') ? 'clean' : 'skipped'));
    sock.write('zINSTREAM\0');
    for (let i = 0; i < buf.length; i += 8192) {
      const chunk = buf.subarray(i, i + 8192); const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
      sock.write(len); sock.write(chunk);
    }
    sock.write(Buffer.alloc(4));
  });
}
