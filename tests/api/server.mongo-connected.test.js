const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const request = require('supertest');

describe('server API with connected Supabase (mocked)', () => {
  let tempRoot;
  let videoDir;
  let app;
  let serverModule;
  let dbMock;
  let dbModulePath;
  let originalRequireAdminOnLoopback;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bst-api-supabase-test-'));
    videoDir = path.join(tempRoot, 'video');

    await fs.mkdir(videoDir, { recursive: true });

    originalRequireAdminOnLoopback = process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK;
    process.env.BST_VIDEO_DIR = videoDir;
    process.env.BST_DISABLE_BROWSER_OPEN = '1';
    process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK = '0';

    dbMock = {
      connectDB: vi.fn(async () => true),
      isConnected: vi.fn(() => true),
      loadDoc: vi.fn(async () => null),
      getEditorRecord: vi.fn(async () => ({
        document: { id: 'class-1', content: { html: '<p>Current</p>' } },
        revision: '2026-10-10T12:00:00.000Z'
      })),
      saveEditorRecordIfRevision: vi.fn(async () => ({
        status: 'saved',
        document: { id: 'class-1', content: { html: '<p>Updated</p>' } },
        revision: '2026-10-10T12:01:00.000Z'
      })),
      saveDoc: vi.fn(async () => true),
      upsertClassRecord: vi.fn(async (_classId, classData) => classData),
      deleteClassRecord: vi.fn(async () => true),
      upsertLessonPlanRecord: vi.fn(async (_planId, planData) => planData),
      deleteLessonPlanRecord: vi.fn(async () => true),
      upsertNoteRecord: vi.fn(async (_noteId, noteData) => noteData),
      deleteNoteRecord: vi.fn(async () => true),
      closeDB: vi.fn(async () => undefined)
    };

    vi.resetModules();

    dbModulePath = require.resolve('../../db');
    delete require.cache[dbModulePath];
    require.cache[dbModulePath] = {
      id: dbModulePath,
      filename: dbModulePath,
      loaded: true,
      exports: dbMock
    };

    delete require.cache[require.resolve('../../server')];
    serverModule = require('../../server');
    app = serverModule.app;
  });

  afterEach(async () => {
    if (serverModule?.stopServer) {
      await serverModule.stopServer();
    }

    delete process.env.BST_VIDEO_DIR;
    delete process.env.BST_DISABLE_BROWSER_OPEN;
    if (originalRequireAdminOnLoopback === undefined) {
      delete process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK;
    } else {
      process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK = originalRequireAdminOnLoopback;
    }

    if (dbModulePath) {
      delete require.cache[dbModulePath];
    }
    delete require.cache[require.resolve('../../server')];

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('upserts a class via partial Supabase endpoint when connected', async () => {
    const response = await request(app)
      .put('/api/supabase/classes/class-99')
      .send({ id: 'class-99', title: 'Connected Upsert' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.classId).toBe('class-99');
    expect(dbMock.upsertClassRecord).toHaveBeenCalledWith(
      'class-99',
      { id: 'class-99', title: 'Connected Upsert' },
      'api-partial-upsert'
    );
  });

  it('loads and revision-checks editor documents', async () => {
    const loaded = await request(app)
      .get('/api/editor/classes/class-1')
      .expect(200);

    expect(loaded.body.revision).toBe('2026-10-10T12:00:00.000Z');
    expect(dbMock.getEditorRecord).toHaveBeenCalledWith('classes', 'class-1', null);

    const saved = await request(app)
      .put('/api/editor/classes/class-1')
      .send({
        expectedRevision: '2026-10-10T12:00:00.000Z',
        content: { html: '<p>Updated</p>', json: {}, text: 'Updated' }
      })
      .expect(200);

    expect(saved.body.revision).toBe('2026-10-10T12:01:00.000Z');
    expect(dbMock.saveEditorRecordIfRevision).toHaveBeenCalledWith(
      'classes',
      'class-1',
      '2026-10-10T12:00:00.000Z',
      { expectedRevision: '2026-10-10T12:00:00.000Z', content: { html: '<p>Updated</p>', json: {}, text: 'Updated' } },
      null
    );
  });

  it('returns the latest document when an editor save conflicts', async () => {
    dbMock.saveEditorRecordIfRevision.mockResolvedValueOnce({
      status: 'conflict',
      document: { id: 'class-1', content: { html: '<p>Other session</p>' } },
      revision: '2026-10-10T12:02:00.000Z'
    });

    const response = await request(app)
      .put('/api/editor/classes/class-1')
      .send({
        expectedRevision: '2026-10-10T12:00:00.000Z',
        content: { html: '<p>My edit</p>', json: {}, text: 'My edit' }
      })
      .expect(409);

    expect(response.body.latestDocument.content.html).toContain('Other session');
    expect(response.body.latestRevision).toBe('2026-10-10T12:02:00.000Z');
  });

  it('deletes class via partial Supabase endpoint when connected', async () => {
    const response = await request(app)
      .delete('/api/supabase/classes/class-99')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.deleted).toBe(true);
    expect(dbMock.deleteClassRecord).toHaveBeenCalledWith('class-99', 'api-partial-delete');
  });

  it('upserts and deletes lesson plans via partial Supabase endpoints when connected', async () => {
    await request(app)
      .put('/api/supabase/lessonPlans/plan-22')
      .send({ id: 'plan-22', title: 'Connected Plan', classes: ['class-1'] })
      .expect(200);

    await request(app)
      .delete('/api/supabase/lessonPlans/plan-22')
      .expect(200);

    expect(dbMock.upsertLessonPlanRecord).toHaveBeenCalledWith(
      'plan-22',
      { id: 'plan-22', title: 'Connected Plan', classes: ['class-1'] },
      'api-partial-upsert'
    );
    expect(dbMock.deleteLessonPlanRecord).toHaveBeenCalledWith('plan-22', 'api-partial-delete');
  });

  it('supports legacy lessonplans supabase routes and marks them deprecated', async () => {
    const upsertResponse = await request(app)
      .put('/api/supabase/lessonplans/plan-legacy')
      .send({ id: 'plan-legacy', title: 'Legacy Plan', classes: ['class-1'] })
      .expect(200);

    const deleteResponse = await request(app)
      .delete('/api/supabase/lessonplans/plan-legacy')
      .expect(200);

    expect(upsertResponse.headers.deprecation).toBe('true');
    expect(String(upsertResponse.headers.link || '')).toContain('/api/supabase/lessonPlans/plan-legacy');
    expect(deleteResponse.headers.deprecation).toBe('true');
    expect(String(deleteResponse.headers.link || '')).toContain('/api/supabase/lessonPlans/plan-legacy');
  });

  it('saves classes via Supabase on save endpoint', async () => {
    const payload = {
      classes: [
        {
          id: 'class-1',
          title: 'Skip Full Sync',
          outline: [],
          media: []
        }
      ]
    };

    const response = await request(app)
      .post('/api/save/classes')
      .send(payload)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(dbMock.saveDoc).toHaveBeenCalledWith('classes', payload);
  });
});
