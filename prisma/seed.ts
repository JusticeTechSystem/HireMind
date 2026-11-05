import { PrismaClient, RoleName } from '@prisma/client';
const prisma = new PrismaClient();
// Limits are PLACEHOLDER defaults per calendar month (-1 = unlimited). Edit freely: they live in the Plan table, not in code.
const plans = [
  { code: 'free', name: 'Free', limits: { aiRequests: 20, transcriptionMinutes: 30, resumeAnalyses: 1, mockInterviews: 1, advancedCodingRequests: 5 } },
  { code: 'pro', name: 'Pro', limits: { aiRequests: 500, transcriptionMinutes: 600, resumeAnalyses: 10, mockInterviews: 20, advancedCodingRequests: 100 },
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY, annual: process.env.STRIPE_PRICE_PRO_ANNUAL },
  { code: 'premium', name: 'Premium', limits: { aiRequests: -1, transcriptionMinutes: -1, resumeAnalyses: -1, mockInterviews: -1, advancedCodingRequests: -1 },
    monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY, annual: process.env.STRIPE_PRICE_PREMIUM_ANNUAL },
];
async function main() {
  for (const name of Object.values(RoleName)) await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  for (const p of plans) {
    const prices = { ...(p.monthly ? { stripePriceMonthly: p.monthly } : {}), ...(p.annual ? { stripePriceAnnual: p.annual } : {}) };
    await prisma.plan.upsert({ where: { code: p.code }, update: { limits: p.limits, ...prices }, create: { code: p.code, name: p.name, limits: p.limits, ...prices } });
  }
}
main().finally(() => prisma.$disconnect());
