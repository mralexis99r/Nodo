import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { summarize } from './db.js';
import { createStorage } from './storage.js';
import {
  credentialsSchema,
  registerSchema,
  profileSchema,
  projectSchema,
  pageSchema,
  verificationSchema,
  importProjectSchema,
} from './schema.js';
import { sampleProject } from './sample.js';
import { createVerificationMailer } from './mailer.js';
import { createEmailVerification } from './email-verification.js';
import { validQACatalogEdits } from '../shared/catalogs.js';
import { completeReferenceNames } from '../shared/qa.js';
import { normalizeWorkItemBlocks } from '../shared/work-links.js';
import { bugReport, applyBugUpdate, connectedBugPages } from '../shared/bugs.js';
import { qaStatuses } from '../shared/qa.js';
import { translateTitle } from './title-translation.js';
import { clonePageBlocks } from '../shared/clone-pages.js';

const scrypt = promisify(scryptCallback);
const now = () => new Date().toISOString();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const publicUser = ({ id, name, email, avatar, language, theme }) => ({
  id,
  name,
  email,
  avatar,
  language,
  theme,
});
const parsePage = (row) => ({
  ...row,
  titleLanguage: row.title_language || 'es',
  titleTranslations: JSON.parse(row.title_translations || '{}'),
  blocks: normalizeWorkItemBlocks(JSON.parse(row.blocks)),
});
const sessionDuration = 1000 * 60 * 60 * 24 * 7;

async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${Buffer.from(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const calculated = await passwordHash(password, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(calculated), Buffer.from(stored));
}

export function createApp({
  databasePath = process.env.DATABASE_PATH || './data/nodo.sqlite',
  databaseUrl = process.env.DATABASE_URL,
  storage,
  production = process.env.NODE_ENV === 'production',
  origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:5173',
  trustProxy = process.env.TRUST_PROXY || '0',
  authLimit = 30,
  mailer = createVerificationMailer(),
  verificationSecret = process.env.EMAIL_CODE_SECRET,
  clock = Date.now,
  titleTranslator = process.env.TITLE_TRANSLATION_PROVIDER === 'mymemory'
    ? translateTitle
    : async () => {
        throw new Error('TRANSLATION_UNAVAILABLE');
      },
} = {}) {
  const app = express();
  const selected = storage || createStorage({ databaseUrl, databasePath, production });
  const db = selected.store;
  app.locals.db = selected.debugDb;
  app.locals.store = db;
  app.locals.ready = db.ready;
  app.use(async (_req, _res, next) => {
    await db.ready;
    next();
  });
  const emailVerification = createEmailVerification({
    db,
    mailer,
    secret: verificationSecret,
    clock,
  });
  app.disable('x-powered-by');
  if (trustProxy !== '0') app.set('trust proxy', Number(trustProxy));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
          'connect-src': ["'self'"],
          'frame-src': ["'none'"],
          'object-src': ["'none'"],
          'upgrade-insecure-requests': production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('X-Nodo-Client') !== 'web')
        return res.status(403).json({ error: 'CSRF_REJECTED' });
      if (req.get('Origin') && req.get('Origin') !== origin)
        return res.status(403).json({ error: 'CSRF_REJECTED' });
    }
    next();
  });
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/api',
    maxAge: sessionDuration,
  };
  async function session(res, userId) {
    const token = randomBytes(32).toString('hex');
    await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    await db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hash(token), userId, Date.now() + sessionDuration);
    res.cookie('nodo_session', token, cookieOptions);
  }
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'TOO_MANY_ATTEMPTS' },
  });
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const input = registerSchema.parse(req.body);
    if (await db.prepare('SELECT id FROM users WHERE email = ?').get(input.email))
      return res.status(409).json({ error: 'EMAIL_EXISTS' });
    emailVerification.assertConfigured();
    const id = randomUUID();
    const password = await passwordHash(input.password);
    try {
      await db
        .prepare(
          'INSERT INTO users (id, email, password_hash, name, language, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, input.email, password, input.name, input.language, now());
    } catch (error) {
      if (error.code === '23505' || String(error.message).includes('UNIQUE'))
        return res.status(409).json({ error: 'EMAIL_EXISTS' });
      throw error;
    }
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const verification = await emailVerification.send(user);
    res.status(202).json({ verificationRequired: true, verification });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(input.email);
    // Perform the expensive hash even for unknown accounts.
    const valid = await verifyPassword(
      input.password,
      user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (!user || !valid) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    if (!user.email_verified_at)
      return res.status(403).json({
        error: 'EMAIL_NOT_VERIFIED',
        verification: await emailVerification.metadata(user),
      });
    if (req.cookies.nodo_session)
      await db
        .prepare('DELETE FROM sessions WHERE token_hash = ?')
        .run(hash(req.cookies.nodo_session));
    await session(res, user.id);
    res.json(publicUser(user));
  });
  async function pendingUser(body) {
    const input = credentialsSchema.parse(body);
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(input.email);
    const valid = await verifyPassword(
      input.password,
      user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (!user || !valid) throw Object.assign(new Error('INVALID_CREDENTIALS'), { status: 401 });
    if (user.email_verified_at)
      throw Object.assign(new Error('EMAIL_ALREADY_VERIFIED'), { status: 400 });
    return user;
  }
  app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
    const input = verificationSchema.parse(req.body);
    const user = await pendingUser(input);
    await emailVerification.verify(user, input.code);
    if (req.cookies.nodo_session)
      await db
        .prepare('DELETE FROM sessions WHERE token_hash = ?')
        .run(hash(req.cookies.nodo_session));
    await session(res, user.id);
    res.json(publicUser(user));
  });
  app.post('/api/auth/resend-verification', authLimiter, async (req, res) => {
    const user = await pendingUser(req.body);
    const verification = await emailVerification.send(user);
    res.json({ verificationRequired: true, verification });
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (req.cookies.nodo_session)
      await db
        .prepare('DELETE FROM sessions WHERE token_hash = ?')
        .run(hash(req.cookies.nodo_session));
    res.clearCookie('nodo_session', { ...cookieOptions, maxAge: undefined });
    res.status(204).end();
  });
  app.get('/api/health', async (_req, res) => {
    await db.ping();
    res.json({ status: 'ok' });
  });
  app.use('/api', async (req, res, next) => {
    const token = req.cookies.nodo_session;
    const user =
      token &&
      (await db
        .prepare(
          'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.email_verified_at IS NOT NULL',
        )
        .get(hash(token), Date.now()));
    if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    req.user = user;
    next();
  });
  app.get('/api/me', (req, res) => res.json(publicUser(req.user)));
  app.patch('/api/me', async (req, res) => {
    const input = profileSchema.parse(req.body);
    await db
      .prepare('UPDATE users SET name = ?, avatar = ?, language = ?, theme = ? WHERE id = ?')
      .run(input.name, input.avatar, input.language, input.theme, req.user.id);
    res.json(publicUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
  });

  const getProject = async (id, userId, includeTrash = false) =>
    await db
      .prepare(
        `SELECT * FROM projects WHERE id = ? AND user_id = ? ${includeTrash ? '' : 'AND deleted_at IS NULL'}`,
      )
      .get(id, userId);
  const getPages = async (projectId) =>
    connectedBugPages(
      (
        await db
          .prepare(
            'SELECT * FROM pages WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
          )
          .all(projectId)
      ).map(parsePage),
    );
  const getPage = async (id, userId, includeTrash = false) =>
    await db
      .prepare(
        `SELECT p.* FROM pages p JOIN projects j ON j.id = p.project_id WHERE p.id = ? AND j.user_id = ? ${includeTrash ? '' : 'AND p.deleted_at IS NULL AND j.deleted_at IS NULL'}`,
      )
      .get(id, userId);
  const touch = async (id) =>
    await db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), id);
  async function saveBugMembers(projectId, pages, bug, patch) {
    const changed = applyBugUpdate(pages, bug, patch);
    for (const page of changed) {
      const original = pages.find((item) => item.id === page.id);
      if (JSON.stringify(page.blocks) === JSON.stringify(original.blocks)) continue;
      const result = await db
        .prepare(
          'UPDATE pages SET blocks = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        )
        .run(JSON.stringify(page.blocks), now(), page.id, page.version);
      if (!result.changes) throw Object.assign(new Error('VERSION_CONFLICT'), { status: 409 });
    }
    await touch(projectId);
  }
  app.put('/api/projects/:id/bugs', async (req, res) => {
    if (!(await getProject(req.params.id, req.user.id)))
      return res.status(404).json({ error: 'NOT_FOUND' });
    const input = z
      .object({
        key: z.string().min(1).max(500),
        revision: z.string().max(200000),
        title: z.string().trim().min(1).max(1000),
        status: z.enum(qaStatuses),
        note: z.string().max(2000),
        history: z.string().max(20000),
      })
      .parse(req.body);
    await db.transaction(async () => {
      await db.lockUser(req.user.id);
      const pages = await getPages(req.params.id);
      const bug = bugReport(pages).find((item) => item.key === input.key);
      if (!bug) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (bug.revision !== input.revision)
        throw Object.assign(new Error('VERSION_CONFLICT'), { status: 409 });
      await saveBugMembers(req.params.id, pages, bug, {
        title: input.title,
        status: input.status,
        note: input.note,
        history: input.history,
      });
    });
    res.json({
      ...(await getProject(req.params.id, req.user.id)),
      pages: await getPages(req.params.id),
    });
  });
  async function insertPage(projectId, input, position = 0) {
    const id = randomUUID(),
      date = now();
    await db
      .prepare(
        'INSERT INTO pages (id, project_id, title, icon, status, blocks, position, created_at, updated_at, title_language, title_translations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        projectId,
        input.title,
        input.icon,
        input.status,
        JSON.stringify(input.blocks),
        position,
        date,
        date,
        input.titleLanguage || input.title_language || 'es',
        JSON.stringify(input.titleTranslations || {}),
      );
    return parsePage(await db.prepare('SELECT * FROM pages WHERE id = ?').get(id));
  }
  async function insertProject(userId, input, id = randomUUID()) {
    const date = now();
    await db
      .prepare(
        'INSERT INTO projects (id, user_id, title, description, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, userId, input.title, input.description, input.icon, input.color, date, date);
    return id;
  }
  app.get('/api/dashboard', async (req, res) => {
    const records = await db
      .prepare(
        'SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
      )
      .all(req.user.id);
    const pagesByProject = await Promise.all(records.map((project) => getPages(project.id)));
    const projects = records.map((project, index) => ({
      ...project,
      summary: summarize(pagesByProject[index]),
    }));
    const allPages = records.flatMap((project, index) =>
      pagesByProject[index].map((page) => ({
        ...page,
        projectTitle: project.title,
        projectColor: project.color,
        projectIcon: project.icon,
      })),
    );
    const summary = summarize(allPages);
    const reminders = allPages
      .flatMap((page) =>
        page.blocks
          .filter((block) => block.type === 'table')
          .flatMap((block) =>
            block.rows
              .filter((row) => row.reminderDate && row.status !== 'done')
              .map((row) => ({
                id: row.id,
                title: row.title,
                date: row.reminderDate,
                pageId: page.id,
                projectId: page.project_id,
                projectTitle: page.projectTitle,
              })),
          ),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);
    res.json({
      projects: projects.length,
      active: projects.filter((p) => p.summary.status !== 'done').length,
      completed: summary.done,
      pending: summary.total - summary.done,
      blocked: summary.blocked,
      progress: summary.progress,
      reminders,
      recent: projects.slice(0, 4),
      pages: allPages.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
    });
  });
  app.get('/api/projects', async (req, res) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(9),
        q: z.string().max(120).default(''),
        favorite: z.enum(['true', 'false']).default('false'),
        status: z.enum(['all', 'todo', 'progress', 'blocked', 'done']).default('all'),
      })
      .parse(req.query);
    const needle = query.q.toLocaleLowerCase();
    const matching = (
      await db
        .prepare(
          'SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY favorite DESC, updated_at DESC',
        )
        .all(req.user.id)
    ).filter(
      (p) =>
        (!query.q || `${p.title} ${p.description}`.toLocaleLowerCase().includes(needle)) &&
        (query.favorite !== 'true' || p.favorite),
    );
    const summaries = await Promise.all(
      matching.map(async (p) => ({ ...p, summary: summarize(await getPages(p.id)) })),
    );
    const filtered = summaries.filter(
      (p) => query.status === 'all' || p.summary.status === query.status,
    );
    res.json({
      items: filtered.slice((query.page - 1) * query.limit, query.page * query.limit),
      total: filtered.length,
      page: query.page,
      pages: Math.max(1, Math.ceil(filtered.length / query.limit)),
    });
  });
  app.post('/api/projects', async (req, res) => {
    const input = projectSchema.parse(req.body);
    const id = await insertProject(req.user.id, input);
    res
      .status(201)
      .json({ ...(await getProject(id, req.user.id)), pages: [], summary: summarize([]) });
  });
  app.post('/api/projects/sample', async (req, res) => {
    const sample = sampleProject(req.user.language);
    const id = await db.transaction(async () => {
      const projectId = await insertProject(req.user.id, projectSchema.parse(sample));
      for (const [index, page] of sample.pages.entries())
        await insertPage(
          projectId,
          pageSchema.parse({ ...page, titleLanguage: req.user.language }),
          index,
        );
      return projectId;
    });
    res.status(201).json({ id });
  });
  app.post('/api/projects/import', async (req, res) => {
    const input = importProjectSchema.parse(req.body);
    const digest = hash(`${req.user.id}:${JSON.stringify(input)}`);
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const result = await db.transaction(async () => {
      await db.lockUser(req.user.id);
      const existing = await getProject(id, req.user.id, true);
      if (existing) return { id, existing: true, inTrash: Boolean(existing.deleted_at) };
      await insertProject(req.user.id, input.project, id);
      for (const [index, page] of input.pages.entries()) {
        await insertPage(
          id,
          {
            ...page,
            blocks: page.blocks.map((block) => ({
              ...block,
              id: randomUUID(),
              ...(['table', 'qa', 'bug-report'].includes(block.type)
                ? { rows: block.rows.map((row) => ({ ...row, id: randomUUID() })) }
                : {}),
            })),
          },
          index,
        );
      }
      return { id, existing: false, inTrash: false };
    });
    res.status(result.existing ? 200 : 201).json(result);
  });
  app.get('/api/trash', async (req, res) => {
    const projects = await db
      .prepare(
        'SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
      )
      .all(req.user.id);
    const pages = (
      await db
        .prepare(
          'SELECT p.*, j.title AS "projectTitle" FROM pages p JOIN projects j ON j.id = p.project_id WHERE j.user_id = ? AND j.deleted_at IS NULL AND p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC',
        )
        .all(req.user.id)
    ).map(parsePage);
    res.json({ projects, pages });
  });
  app.get('/api/projects/:id', async (req, res) => {
    const project = await getProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'NOT_FOUND' });
    const pages = await getPages(project.id);
    res.json({ ...project, pages, summary: summarize(pages) });
  });
  app.patch('/api/projects/:id', async (req, res) => {
    const project = await getProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'NOT_FOUND' });
    const input = projectSchema
      .extend({ favorite: z.boolean() })
      .parse({ ...project, favorite: Boolean(project.favorite), ...req.body });
    await db
      .prepare(
        'UPDATE projects SET title = ?, description = ?, icon = ?, color = ?, favorite = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        input.title,
        input.description,
        input.icon,
        input.color,
        Number(input.favorite),
        now(),
        project.id,
      );
    res.json({
      ...(await getProject(project.id, req.user.id)),
      summary: summarize(await getPages(project.id)),
    });
  });
  app.delete('/api/projects/:id', async (req, res) => {
    if (!(await getProject(req.params.id, req.user.id)))
      return res.status(404).json({ error: 'NOT_FOUND' });
    await db.prepare('UPDATE projects SET deleted_at = ? WHERE id = ?').run(now(), req.params.id);
    res.status(204).end();
  });
  app.post('/api/projects/:id/restore', async (req, res) => {
    if (!(await getProject(req.params.id, req.user.id, true)))
      return res.status(404).json({ error: 'NOT_FOUND' });
    await db
      .prepare('UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?')
      .run(now(), req.params.id);
    res.status(204).end();
  });
  app.post('/api/projects/:id/duplicate', async (req, res) => {
    const project = await getProject(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'NOT_FOUND' });
    const id = await db.transaction(async () => {
      const projectId = await insertProject(req.user.id, {
        ...project,
        title: `${project.title.slice(0, 110)} (${req.user.language === 'es' ? 'copia' : 'copy'})`,
      });
      for (const [index, page] of clonePageBlocks(
        await getPages(project.id),
        randomUUID,
      ).entries()) {
        await insertPage(projectId, page, index);
      }
      return projectId;
    });
    res.status(201).json({ id });
  });
  app.post('/api/projects/:id/pages', async (req, res) => {
    if (!(await getProject(req.params.id, req.user.id)))
      return res.status(404).json({ error: 'NOT_FOUND' });
    const input = pageSchema.parse(req.body);
    input.titleLanguage ||= req.user.language;
    input.blocks = completeReferenceNames(input.blocks);
    if (!validQACatalogEdits(input.blocks))
      return res.status(400).json({ error: 'INVALID_CATALOG_VALUE' });
    const position = (
      await db
        .prepare(
          'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM pages WHERE project_id = ?',
        )
        .get(req.params.id)
    ).position;
    const page = await insertPage(req.params.id, input, position);
    await touch(req.params.id);
    res.status(201).json(page);
  });
  app.post('/api/projects/:id/import-cases', async (req, res) => {
    if (!(await getProject(req.params.id, req.user.id)))
      return res.status(404).json({ error: 'NOT_FOUND' });
    const input = pageSchema.parse(req.body);
    if (!input.blocks.some((block) => block.type === 'qa' && block.kind === 'cases'))
      return res.status(400).json({ error: 'INVALID_IMPORT' });
    const result = await db.transaction(async () => {
      await db.lockUser(req.user.id);
      const pages = await getPages(req.params.id);
      const caseIds = new Set(
        input.blocks
          .filter((block) => block.type === 'qa' && block.kind === 'cases')
          .flatMap((block) => block.rows.map((row) => row.id)),
      );
      const existing = pages.find((page) =>
        page.blocks.some((block) => block.rows?.some((row) => caseIds.has(row.id))),
      );
      if (existing) return { page: existing, existing: true };
      const position = (
        await db
          .prepare(
            'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM pages WHERE project_id = ?',
          )
          .get(req.params.id)
      ).position;
      const page = await insertPage(req.params.id, input, position);
      await touch(req.params.id);
      return { page, existing: false };
    });
    res.status(result.existing ? 200 : 201).json(result);
  });
  const translationLimiter = rateLimit({
    windowMs: 3600000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'TOO_MANY_ATTEMPTS' },
  });
  app.post('/api/projects/:id/translate-titles', translationLimiter, async (req, res) => {
    if (!(await getProject(req.params.id, req.user.id)))
      return res.status(404).json({ error: 'NOT_FOUND' });
    const { language } = z.object({ language: z.enum(['es', 'en']) }).parse(req.body);
    const pages = await getPages(req.params.id);
    const failures = [];
    for (const page of pages) {
      if (page.titleLanguage === language || page.titleTranslations[language]) continue;
      try {
        const translated = await titleTranslator(page.title, page.titleLanguage, language);
        const fresh = await getPage(page.id, req.user.id);
        if (!fresh || fresh.title !== page.title) continue;
        const translations = { ...JSON.parse(fresh.title_translations), [language]: translated };
        await db
          .prepare('UPDATE pages SET title_translations = ? WHERE id = ? AND title = ?')
          .run(JSON.stringify(translations), page.id, page.title);
      } catch {
        failures.push(page.id);
      }
    }
    res.json({
      pages: (await getPages(req.params.id)).map(({ id, title, titleTranslations }) => ({
        id,
        title,
        titleTranslations,
      })),
      failures,
    });
  });
  app.put('/api/pages/:id', async (req, res) => {
    const page = await getPage(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'NOT_FOUND' });
    const input = pageSchema.extend({ version: z.number().int().positive() }).parse(req.body);
    input.blocks = completeReferenceNames(input.blocks, JSON.parse(page.blocks));
    if (!validQACatalogEdits(input.blocks, JSON.parse(page.blocks)))
      return res.status(400).json({ error: 'INVALID_CATALOG_VALUE' });
    await db.transaction(async () => {
      await db.lockUser(req.user.id);
      const pages = await getPages(page.project_id);
      const oldBugs = bugReport(pages);
      const renamed = input.title !== page.title;
      const result = await db
        .prepare(
          'UPDATE pages SET title = ?, title_language = ?, title_translations = ?, icon = ?, status = ?, blocks = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        )
        .run(
          input.title,
          renamed ? input.titleLanguage || req.user.language : page.title_language,
          renamed ? '{}' : page.title_translations,
          input.icon,
          input.status,
          JSON.stringify(input.blocks),
          now(),
          page.id,
          input.version,
        );
      if (!result.changes) throw Object.assign(new Error('VERSION_CONFLICT'), { status: 409 });
      for (const block of input.blocks.filter(
        (b) => b.type === 'bug-report' || (b.type === 'qa' && b.kind === 'bugs'),
      )) {
        for (const row of block.rows) {
          const old = pages
            .find((p) => p.id === page.id)
            ?.blocks.find((b) => b.id === block.id)
            ?.rows?.find((r) => r.id === row.id);
          if (
            !old ||
            ['title', 'status', 'note', 'history'].every((field) => row[field] === old[field])
          )
            continue;
          const bug = oldBugs.find((b) =>
            b.members.some(
              (m) => m.rowId === row.id && m.pageId === page.id && m.blockId === block.id,
            ),
          );
          if (bug)
            await saveBugMembers(page.project_id, await getPages(page.project_id), bug, {
              title: row.title,
              status: row.status || 'BUG',
              note: row.note,
              history: row.history,
            });
        }
      }
      await touch(page.project_id);
    });
    res.json((await getPages(page.project_id)).find((item) => item.id === page.id));
  });
  app.delete('/api/pages/:id', async (req, res) => {
    const page = await getPage(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'NOT_FOUND' });
    await db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?').run(now(), page.id);
    await touch(page.project_id);
    res.status(204).end();
  });
  app.post('/api/pages/:id/restore', async (req, res) => {
    const page = await getPage(req.params.id, req.user.id, true);
    if (!page || !(await getProject(page.project_id, req.user.id)))
      return res.status(404).json({ error: 'NOT_FOUND' });
    await db
      .prepare(
        'UPDATE pages SET deleted_at = NULL, version = version + 1, updated_at = ? WHERE id = ?',
      )
      .run(now(), page.id);
    await touch(page.project_id);
    res.status(204).end();
  });
  app.post('/api/pages/:id/duplicate', async (req, res) => {
    const stored = await getPage(req.params.id, req.user.id);
    if (!stored) return res.status(404).json({ error: 'NOT_FOUND' });
    const page = parsePage(stored);
    const position = (
      await db
        .prepare(
          'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM pages WHERE project_id = ?',
        )
        .get(page.project_id)
    ).position;
    const copy = await insertPage(
      page.project_id,
      {
        ...page,
        title: `${page.title.slice(0, 110)} (${req.user.language === 'es' ? 'copia' : 'copy'})`,
        titleTranslations: {},
        blocks: clonePageBlocks([page], randomUUID)[0].blocks,
      },
      position,
    );
    await touch(page.project_id);
    res.status(201).json(copy);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  const dist = resolve('dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (
      error.status &&
      [
        'MAIL_NOT_CONFIGURED',
        'MAIL_DELIVERY_FAILED',
        'EMAIL_ALREADY_VERIFIED',
        'INVALID_CREDENTIALS',
        'VERIFICATION_COOLDOWN',
        'VERIFICATION_SEND_LIMIT',
        'VERIFICATION_INVALID',
        'VERIFICATION_EXPIRED',
        'VERIFICATION_ATTEMPTS_EXCEEDED',
        'VERSION_CONFLICT',
        'NOT_FOUND',
      ].includes(error.message)
    )
      return res.status(error.status).json({ error: error.message, ...error.details });
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues.some((issue) => issue.message === 'EMAIL_MISMATCH')
          ? 'EMAIL_MISMATCH'
          : 'INVALID_INPUT',
        fields: error.issues.map((issue) => issue.path.join('.')),
      });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'CONTENT_TOO_LARGE' });
    if (error instanceof SyntaxError && error.status === 400)
      return res.status(400).json({ error: 'INVALID_INPUT' });
    console.error('Request failed:', error.code || error.name);
    res.status(500).json({ error: 'SERVER_ERROR' });
  });
  return app;
}
