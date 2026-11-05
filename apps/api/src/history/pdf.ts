import * as fs from 'fs';
import PDFDocument from 'pdfkit';
export interface PdfData { title: string; date: Date; minutes: number; summary?: { overview?: string; keyTopics?: string[]; strengths?: string[]; improvements?: string[] } | null;
  questions: { text: string; answer?: string }[]; transcript: { source: string; offsetMs: number; text: string }[] }
const t = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
/** Standard PDF fonts only cover Latin text; other scripts will not render. */
export function buildSessionPdf(d: PdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, info: { Title: d.title } }); const chunks: Buffer[] = [];
    const fp = process.env.PDF_FONT_PATH; const unicode = !!fp && fs.existsSync(fp); if (unicode) { doc.registerFont('Body', fp as string); doc.font('Body'); } // set PDF_FONT_PATH to a Unicode TTF (e.g. Noto Sans) for non-Latin text
    doc.on('data', (b: Buffer) => chunks.push(b)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const h = (x: string) => { doc.moveDown().fontSize(14).fillColor('#5b21b6').text(x).fillColor('black').fontSize(10); };
    doc.fontSize(20).text(d.title); doc.fontSize(10).fillColor('gray').text(`${d.date.toISOString().slice(0, 10)} · ${d.minutes} min active · JusticeView`).fillColor('black');
    if (!unicode && /[^\u0000-\u024f\u2000-\u206f]/.test(JSON.stringify(d))) doc.fillColor('gray').text('Note: some characters may not display in this export; the operator can set PDF_FONT_PATH to a Unicode font.').fillColor('black');
    if (d.summary) { h('Summary'); if (d.summary.overview) doc.text(d.summary.overview);
      for (const [k, v] of [['Key topics', d.summary.keyTopics], ['Strengths', d.summary.strengths], ['To improve', d.summary.improvements]] as const) if (v?.length) doc.moveDown(0.5).text(`${k}: ${v.join('; ')}`); }
    if (d.questions.length) { h('Questions'); d.questions.forEach((q, i) => { doc.font(unicode ? 'Body' : 'Helvetica-Bold').text(`${i + 1}. ${q.text}`).font(unicode ? 'Body' : 'Helvetica'); if (q.answer) doc.text(q.answer); doc.moveDown(0.5); }); }
    if (d.transcript.length) { h('Transcript'); d.transcript.forEach((l) => doc.text(`[${t(l.offsetMs)}] ${l.source === 'MICROPHONE' ? 'You' : 'Interviewer'}: ${l.text}`)); }
    doc.end();
  });
}
