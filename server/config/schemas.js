const { z } = require('zod');
const {
  MAX_CLASSES_PER_PAYLOAD,
  MAX_LESSON_PLANS_PER_PAYLOAD,
  MAX_NOTES_PER_PAYLOAD,
  MAX_ITEMS_PER_CLASS_OUTLINE,
  MAX_ITEMS_PER_CLASS_MEDIA,
  MAX_CLASSES_PER_LESSON_PLAN
} = require('./env');

const baseStringSchema = z.string().trim();
const boundedIdSchema = baseStringSchema.min(1).max(120);
const boundedTitleSchema = baseStringSchema.min(1).max(240);

const classRecordSchema = z.object({
  id: boundedIdSchema.optional(),
  classId: boundedIdSchema.optional(),
  classNumber: z.union([
    baseStringSchema.min(1).max(40),
    z.number().int().min(0).max(100000)
  ]).optional(),
  title: boundedTitleSchema.optional(),
  outline: z.array(z.any()).max(MAX_ITEMS_PER_CLASS_OUTLINE).optional(),
  media: z.array(z.any()).max(MAX_ITEMS_PER_CLASS_MEDIA).optional()
}).passthrough();

const lessonPlanRecordSchema = z.object({
  id: boundedIdSchema.optional(),
  planId: boundedIdSchema.optional(),
  title: boundedTitleSchema.optional(),
  classes: z.array(boundedIdSchema).max(MAX_CLASSES_PER_LESSON_PLAN).optional()
}).passthrough();

const classesSaveSchema = z.object({
  classes: z.array(classRecordSchema).max(MAX_CLASSES_PER_PAYLOAD)
}).passthrough();

const lessonPlansSaveSchema = z.object({
  lessonPlans: z.array(lessonPlanRecordSchema).max(MAX_LESSON_PLANS_PER_PAYLOAD)
}).passthrough();

const noteRecordSchema = z.object({
  id: boundedIdSchema.optional(),
  noteId: boundedIdSchema.optional(),
  title: boundedTitleSchema.optional(),
  content: z.any().optional()
}).passthrough();

const notesSaveSchema = z.object({
  notes: z.array(noteRecordSchema).max(MAX_NOTES_PER_PAYLOAD)
}).passthrough();

const editorContentSchema = z.object({
  html: z.string().max(8_000_000),
  json: z.any(),
  text: z.string().max(8_000_000)
});

const editorSaveSchema = z.object({
  expectedRevision: boundedIdSchema.max(100),
  content: editorContentSchema.optional(),
  generatedOutline: z.array(z.any()).optional(),
  outline: z.array(z.any()).optional(),
  bibleTranslation: baseStringSchema.max(40).optional()
}).refine(payload => (
  payload.content !== undefined ||
  payload.generatedOutline !== undefined ||
  payload.outline !== undefined ||
  payload.bibleTranslation !== undefined
), { message: 'At least one editor field must be provided.' });

function issuePathToString(issuePath) {
  if (!Array.isArray(issuePath) || issuePath.length === 0) {
    return 'root';
  }

  return issuePath
    .map((part) => (typeof part === 'number' ? `[${part}]` : String(part)))
    .join('.');
}

function formatZodIssues(error, maxIssues = 8) {
  if (!error?.issues || !Array.isArray(error.issues)) {
    return [];
  }

  return error.issues.slice(0, maxIssues).map((issue) => ({
    path: issuePathToString(issue.path),
    message: issue.message
  }));
}

function parseBodyWithSchema(schema, payload, errorMessage) {
  const result = schema.safeParse(payload);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    status: 400,
    error: errorMessage,
    details: formatZodIssues(result.error)
  };
}

module.exports = {
  classesSaveSchema,
  lessonPlansSaveSchema,
  notesSaveSchema,
  editorSaveSchema,
  parseBodyWithSchema
};
