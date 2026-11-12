import { z } from 'zod';
import { qaStatuses } from '../shared/qa.js';
import { workAreas, workTypes } from '../shared/catalogs.js';
import { normalizeWorkItem } from '../shared/work-links.js';

export const icons = [
  'layers',
  'folder',
  'code',
  'file',
  'rocket',
  'book',
  'coffee',
  'globe',
  'sparkles',
  'terminal',
  'heart',
  'user',
];
export const colors = ['blue', 'green', 'orange', 'purple', 'rose', 'gray'];
export const statuses = ['todo', 'progress', 'blocked', 'done'];
export const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      return ['https:', 'http:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'INVALID_URL');
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const mark = z.object({
  type: z.enum(['bold', 'italic', 'underline', 'strike', 'code', 'link', 'textStyle', 'highlight']),
  attrs: z
    .object({
      href: safeUrl.optional(),
      target: z.enum(['_blank', '_self']).nullable().optional(),
      rel: z.string().max(120).nullable().optional(),
      class: z.string().max(80).nullable().optional(),
      color: color.nullable().optional(),
      backgroundColor: color.nullable().optional(),
    })
    .optional(),
});
const richNode = z.lazy(() =>
  z.object({
    type: z.enum([
      'doc',
      'paragraph',
      'text',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'blockquote',
      'hardBreak',
      'horizontalRule',
      'codeBlock',
    ]),
    text: z.string().max(100000).optional(),
    attrs: z
      .object({
        level: z.number().int().min(1).max(3).optional(),
        start: z.number().int().min(1).optional(),
        language: z.string().max(40).nullable().optional(),
      })
      .optional(),
    marks: z.array(mark).max(12).optional(),
    content: z.array(richNode).max(500).optional(),
  }),
);
const richDocument = z
  .unknown()
  .superRefine((value, context) => {
    const pending = [{ node: value, depth: 0 }];
    let count = 0;
    while (pending.length) {
      const { node, depth } = pending.pop();
      if (depth > 32 || ++count > 5000) {
        context.addIssue({ code: 'custom', message: 'DOCUMENT_TOO_COMPLEX' });
        return;
      }
      if (node && typeof node === 'object' && Array.isArray(node.content)) {
        pending.push(...node.content.map((child) => ({ node: child, depth: depth + 1 })));
      }
    }
  })
  .pipe(richNode.refine((value) => value.type === 'doc', 'INVALID_DOCUMENT'));
export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().max(300),
  status: z.enum(statuses),
  priority: z.enum(['low', 'medium', 'high']),
  url: z.union([z.literal(''), safeUrl]).default(''),
  itemType: z.enum(workTypes).default('task'),
  classification: z.union([z.literal(''), z.enum(workAreas)]).default(''),
  reminderDate: z.union([z.literal(''), z.iso.date()]).default(''),
});
export const qaRowSchema = z
  .object({
    id: z.uuid(),
    reference: z.string().max(500).default(''),
    title: z.string().max(1000).default(''),
    status: z.union([z.literal(''), z.enum(qaStatuses)]).default('PENDIENTE'),
    classification: z.string().max(200).default(''),
    automation: z.string().max(200).default(''),
    bug: z.string().max(10000).default(''),
    url: z.union([z.literal(''), safeUrl]).default(''),
    workItemId: z
      .string()
      .regex(/^\d{1,20}$|^$/)
      .default(''),
    linkLabel: z.string().max(2000).default(''),
    note: z.string().max(2000).default(''),
    history: z.string().max(20000).default(''),
    module: z.string().max(300).default(''),
    sourceRow: z.number().int().min(1).optional(),
  })
  .transform(normalizeWorkItem);
export const blockSchema = z.discriminatedUnion('type', [
  z
    .object({
      id: z.uuid(),
      type: z.literal('record-report'),
      title: z.string().max(120),
      dataset: z.enum(['tasks', 'cases', 'bugs']).default('tasks'),
      field: z
        .enum(['status', 'classification', 'automation', 'itemType', 'priority'])
        .default('status'),
      scope: z.enum(['project', 'page']).default('project'),
      view: z.enum(['bars', 'table']).default('bars'),
    })
    .refine(
      (value) =>
        value.dataset === 'tasks'
          ? value.field !== 'automation'
          : ['status', 'classification', 'automation'].includes(value.field),
      'INVALID_REPORT_FIELD',
    ),
  z.object({
    id: z.uuid(),
    type: z.literal('qa'),
    kind: z.enum(['cases', 'bugs', 'references']),
    title: z.string().max(120),
    source: z.string().max(300).default(''),
    workItemBase: z.union([z.literal(''), safeUrl]).default(''),
    options: z
      .object({
        classification: z.array(z.string().max(200)).max(80).default([]),
        automation: z.array(z.string().max(200)).max(80).default([]),
        note: z.array(z.string().max(2000)).max(80).default([]),
      })
      .default({ classification: [], automation: [], note: [] }),
    rows: z.array(qaRowSchema).max(500),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('text'),
    content: richDocument,
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('table'),
    kind: z.enum(['tasks', 'development']).default('tasks'),
    title: z.string().max(120),
    rows: z.array(taskSchema).max(500),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('report'),
    title: z.string().max(120),
    scope: z.enum(['page', 'project']).optional(),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('link'),
    title: z.string().max(200),
    url: safeUrl,
    preview: z.boolean(),
  }),
]);
export const projectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(''),
  icon: z.enum(icons).default('folder'),
  color: z.enum(colors).default('blue'),
});
export const pageSchema = z.object({
  title: z.string().trim().min(1).max(120),
  icon: z.enum(icons).default('file'),
  status: z.enum(statuses).default('todo'),
  blocks: z.array(blockSchema).max(100).default([]),
});
export const importProjectSchema = z.object({
  format: z.literal('nodo-project'),
  version: z.literal(1),
  project: projectSchema,
  pages: z.array(pageSchema).min(1).max(30),
  warnings: z.array(z.string().max(2000)).max(100).default([]),
});
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  avatar: z.enum(icons),
  language: z.enum(['es', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
});
export const credentialsSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
});
export const registerSchema = credentialsSchema
  .extend({
    name: z.string().trim().min(1).max(80),
    language: z.enum(['es', 'en']).default('es'),
    emailConfirmation: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  })
  .refine((value) => value.email === value.emailConfirmation, {
    message: 'EMAIL_MISMATCH',
    path: ['emailConfirmation'],
  });
export const verificationSchema = credentialsSchema.extend({ code: z.string().regex(/^\d{6}$/) });
