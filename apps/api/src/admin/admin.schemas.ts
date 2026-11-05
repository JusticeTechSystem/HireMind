import { z } from 'zod';
const metric = z.number().int().min(-1); // -1 = unlimited
export const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  limits: z.object({ aiRequests: metric, transcriptionMinutes: metric, resumeAnalyses: metric, mockInterviews: metric, advancedCodingRequests: metric }).optional(),
  priceMonthlyCents: z.number().int().min(0).nullable().optional(), priceAnnualCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().regex(/^[a-z]{3}$/).optional(),
  stripePriceMonthly: z.string().regex(/^price_\w+$/).nullable().optional(), stripePriceAnnual: z.string().regex(/^price_\w+$/).nullable().optional(),
}).strict();
export const planCodeSchema = z.enum(['free', 'pro', 'premium']);
export const pricingSchema = z.object({
  currency: z.string().regex(/^[A-Za-z]{3}$/).default('USD'),
  models: z.record(z.string().max(80), z.object({ inputPer1M: z.number().min(0), outputPer1M: z.number().min(0) })).default({}),
  transcriptionPerMinute: z.number().min(0).optional() });
export type Pricing = z.infer<typeof pricingSchema>;
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const roleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) });
export const ticketUpdateSchema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']), adminNote: z.string().trim().max(2000).optional() });
export const announcementSchema = z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(1000), expiresAt: z.string().datetime().optional() });
export const supportSchema = z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(4000) });
