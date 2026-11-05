import { BadRequestException } from '@nestjs/common';
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
/** Validates by magic bytes, not by client-supplied mimetype/extension. */
export function detectResumeType(buf: Buffer): 'pdf' | 'docx' {
  if (buf.length === 0) throw new BadRequestException('Empty file');
  if (buf.length > MAX_RESUME_BYTES) throw new BadRequestException('File exceeds 5 MB');
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  // DOCX is a ZIP containing word/document.xml
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from('word/'))) return 'docx';
  throw new BadRequestException('Only PDF and DOCX files are supported');
}
