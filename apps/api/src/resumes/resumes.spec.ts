import { BadRequestException, NotFoundException } from '@nestjs/common';
import { detectResumeType, MAX_RESUME_BYTES } from './file-validation';
import { retrieveContext } from './retrieval';
import { ResumesService } from './resumes.service';
import { resumeProfileSchema } from '@hiremind/validation';

describe('file validation', () => {
  it('accepts PDF magic bytes', () => expect(detectResumeType(Buffer.from('%PDF-1.7 x'))).toBe('pdf'));
  it('accepts DOCX zip', () => expect(detectResumeType(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('word/document.xml')]))).toBe('docx'));
  it('rejects spoofed exe', () => expect(() => detectResumeType(Buffer.from('MZ....'))).toThrow(BadRequestException));
  it('rejects empty and oversize', () => {
    expect(() => detectResumeType(Buffer.alloc(0))).toThrow(BadRequestException);
    expect(() => detectResumeType(Buffer.alloc(MAX_RESUME_BYTES + 1))).toThrow(BadRequestException);
  });
});

describe('retrieveContext', () => {
  const p = resumeProfileSchema.parse({ skills: ['PostgreSQL', 'Kubernetes'], employment: [{ company: 'Acme', role: 'Backend Engineer', highlights: ['Scaled Redis caching layer'] }], projects: [{ name: 'Chatbot', description: 'Telegram bot in Python', technologies: ['Python'] }] });
  it('ranks relevant items first', () => {
    const r = retrieveContext(p, 'How did you use Redis caching at scale?');
    expect(r[0].label).toContain('Backend Engineer');
  });
  it('returns nothing for unrelated questions', () => expect(retrieveContext(p, 'Describe your favourite colour')).toEqual([]));
});

describe('ResumesService ownership & model validation', () => {
  const prisma: any = { resume: { findFirst: jest.fn(async () => null), update: jest.fn(), delete: jest.fn() } };
  const svc = new ResumesService(prisma, {} as any, { jsonCompletion: async () => ({ skills: 'not-an-array' }) } as any);
  it("hides other users' resumes as 404", async () => {
    await expect(svc.url('u1', 'r-of-u2')).rejects.toThrow(NotFoundException);
    expect(prisma.resume.findFirst).toHaveBeenCalledWith({ where: { id: 'r-of-u2', userId: 'u1' } });
  });
  it('marks analysis failed when model output violates schema', async () => {
    prisma.resume.findFirst.mockResolvedValueOnce({ id: 'r1', extractedText: 'x' });
    await expect(svc.analyze('u1', 'r1')).rejects.toBeDefined();
    expect(prisma.resume.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { analysisStatus: 'failed' } });
  });
});
