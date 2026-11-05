import { z } from 'zod';
export const onboardingSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(120),
  careerLevel: z.enum(['student', 'junior', 'mid', 'senior', 'lead', 'executive']),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  industry: z.string().trim().min(2).max(120),
  specialization: z.string().trim().min(2).max(120),
  languages: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  frameworks: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  interviewCategory: z.enum(['technical', 'behavioral', 'system-design', 'coding', 'mixed']),
  answerStyle: z.enum(['CONCISE', 'DETAILED', 'CONVERSATIONAL', 'STAR', 'TECHNICAL']),
  objectives: z.string().trim().max(1000).optional(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

export const resumeProfileSchema = z.object({
  summary: z.string().max(2000).default(''),
  skills: z.array(z.string().max(60)).max(100).default([]),
  technologies: z.array(z.string().max(60)).max(100).default([]),
  employment: z.array(z.object({ company: z.string(), role: z.string(), period: z.string().optional(), highlights: z.array(z.string()).default([]) })).max(30).default([]),
  projects: z.array(z.object({ name: z.string(), description: z.string().default(''), technologies: z.array(z.string()).default([]) })).max(30).default([]),
  education: z.array(z.object({ institution: z.string(), qualification: z.string().optional(), period: z.string().optional() })).max(10).default([]),
  certifications: z.array(z.string().max(120)).max(30).default([]),
});
export type ResumeProfile = z.infer<typeof resumeProfileSchema>;

export const createInterviewSchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.enum(['technical', 'behavioral', 'system-design', 'coding', 'mixed']).default('mixed'),
  resumeId: z.string().uuid().optional(),
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const sourceSchema = z.enum(['MICROPHONE', 'SYSTEM']);
export const sessionRefSchema = z.object({ sessionId: z.string().uuid() });
export const transcriptPartialSchema = z.object({ sessionId: z.string().uuid(), source: sourceSchema, itemId: z.string().min(1).max(200), text: z.string().max(4000) });
export const transcriptFinalSchema = z.object({ sessionId: z.string().uuid(), source: sourceSchema, eventId: z.string().min(1).max(200), text: z.string().trim().min(1).max(4000), offsetMs: z.number().int().min(0).max(86_400_000) });
export type TranscriptFinal = z.infer<typeof transcriptFinalSchema>;

export const answerModeSchema = z.enum(['CONCISE', 'DETAILED', 'CONVERSATIONAL', 'STAR', 'TECHNICAL', 'BEGINNER', 'ADVANCED']);
export const questionCategorySchema = z.enum(['direct', 'technical', 'coding', 'behavioral', 'system_design', 'follow_up', 'scenario', 'general']);
export const classificationSchema = z.object({
  isQuestion: z.boolean(), category: questionCategorySchema, difficulty: z.enum(['easy', 'medium', 'hard']),
  confidence: z.number().min(0).max(1), cleanedQuestion: z.string().trim().min(3).max(600) });
export const aiAnswerSchema = z.object({
  question: z.string().max(800), category: questionCategorySchema, difficulty: z.enum(['easy', 'medium', 'hard']),
  shortAnswer: z.string().min(1).max(2000), detailedAnswer: z.string().min(1).max(8000),
  keyPoints: z.array(z.string().max(400)).max(12).default([]), relevantSkills: z.array(z.string().max(80)).max(20).default([]),
  relatedResumeExperience: z.array(z.object({ label: z.string().max(200), evidence: z.string().max(600).default('') })).max(8).default([]),
  followUps: z.array(z.string().max(300)).max(6).default([]),
  codeExamples: z.array(z.object({ language: z.string().max(30), code: z.string().max(6000), explanation: z.string().max(1000).default('') })).max(4).default([]),
  confidence: z.object({ level: z.enum(['low', 'medium', 'high']), notes: z.string().max(500).default('') }),
  personalExperience: z.object({ status: z.enum(['verified', 'suggested_example', 'not_applicable']), notes: z.string().max(500).default('') }),
});
export type AiAnswer = z.infer<typeof aiAnswerSchema>;
export type AnswerMode = z.infer<typeof answerModeSchema>;

export const languageSchema = z.enum(['javascript', 'typescript', 'react', 'node', 'python', 'java', 'cpp', 'sql', 'go']);
export const codingRequestSchema = z.object({
  language: languageSchema, mode: z.enum(['solve', 'debug', 'optimize', 'explain']).default('solve'),
  prompt: z.string().trim().min(5).max(4000), code: z.string().max(12000).optional() });
export const codingResponseSchema = z.object({
  problemUnderstanding: z.string().max(3000), approach: z.string().max(3000), code: z.string().min(1).max(12000),
  steps: z.array(z.string().max(600)).max(20).default([]), timeComplexity: z.string().max(200), spaceComplexity: z.string().max(200),
  edgeCases: z.array(z.string().max(300)).max(15).default([]),
  testCases: z.array(z.object({ input: z.string().max(500), expected: z.string().max(500) })).max(15).default([]) });
export type CodingResponse = z.infer<typeof codingResponseSchema>;
export const systemDesignRequestSchema = z.object({ prompt: z.string().trim().min(10).max(3000) });
const list = z.array(z.string().max(500)).max(20).default([]);
export const systemDesignResponseSchema = z.object({
  functionalRequirements: list, nonFunctionalRequirements: list, highLevelArchitecture: z.string().max(4000), lowLevelDesign: z.string().max(4000),
  databaseDesign: z.string().max(3000), apiDesign: z.string().max(3000), scalability: list, caching: list, loadBalancing: list,
  messageQueues: list, microservices: list, security: list, reliability: list,
  tradeoffs: z.array(z.object({ decision: z.string().max(300), pros: list, cons: list })).max(10).default([]),
  mermaid: z.string().max(4000).default('') });
export type SystemDesignResponse = z.infer<typeof systemDesignResponseSchema>;
export const mockCreateSchema = z.object({
  category: z.enum(['technical', 'behavioral', 'system-design', 'coding', 'mixed']), jobTitle: z.string().trim().min(2).max(120),
  level: z.enum(['student', 'junior', 'mid', 'senior', 'lead']), difficulty: z.enum(['easy', 'medium', 'hard']),
  durationMin: z.coerce.number().int().min(5).max(120), numQuestions: z.coerce.number().int().min(1).max(15) });
export type MockCreateInput = z.infer<typeof mockCreateSchema>;
export const mockAnswerSchema = z.object({ answerText: z.string().trim().min(5).max(6000) });
const score = z.number().int().min(0).max(10);
export const mockEvalSchema = z.object({
  scores: z.object({ relevance: score, technicalCorrectness: score, completeness: score, clarity: score, communication: score, structure: score }),
  strengths: z.array(z.string().max(400)).max(8).default([]), improvements: z.array(z.string().max(400)).max(8).default([]),
  idealAnswerOutline: z.string().max(3000).default('') });
export type MockEval = z.infer<typeof mockEvalSchema>;

export const sessionSummarySchema = z.object({
  overview: z.string().max(3000), keyTopics: z.array(z.string().max(120)).max(15).default([]),
  strengths: z.array(z.string().max(400)).max(8).default([]), improvements: z.array(z.string().max(400)).max(8).default([]) });
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const audioStatusSchema = z.object({ sessionId: z.string().uuid(), source: sourceSchema,
  status: z.enum(['off', 'requesting', 'on', 'denied', 'unsupported', 'no-audio', 'cancelled', 'disconnected', 'error']) });
export const retentionSchema = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365), z.null()]) });
export const feedbackSchema = z.object({ rating: z.union([z.literal(1), z.literal(-1)]), comment: z.string().trim().max(500).optional() });

export const passwordResetSchema = z.object({ password: z.string().min(8).max(128), confirm: z.string() }).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
export const explainSchema = z.object({ summary: z.string().max(1500), whyItWorks: z.array(z.string().max(400)).max(8).default([]), risks: z.array(z.string().max(400)).max(8).default([]), howToDeliver: z.array(z.string().max(400)).max(8).default([]) });
export type Explanation = z.infer<typeof explainSchema>;
