const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const request = require('supertest');

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

describe('server API with connected Mongo (mocked)', () => {
  let tempRoot;
  let dataDir;
  let backupDir;
  let videoDir;
  let app;
  let serverModule;
  let dbMock;
  let dbModulePath;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bst-api-mongo-test-'));
    dataDir = path.join(tempRoot, 'data');
    backupDir = path.join(tempRoot, 'backups');
    videoDir = path.join(tempRoot, 'video');

    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(backupDir, { recursive: true });
    await fs.mkdir(videoDir, { recursive: true });

    await writeJson(path.join(dataDir, 'classes.json'), {
      classes: [
        {
          id: 'class-1',
          title: 'Test Class',
          outline: [],
          media: []
        }
      ]
    });

    await writeJson(path.join(dataDir, 'lessonPlans.json'), {
      lessonPlans: [
        {
          id: 'lesson-1',
          title: 'Test Lesson Plan',
          classes: ['class-1']
        }
      ]
    });

    process.env.BST_DATA_DIR = dataDir;
    process.env.BST_BACKUP_DIR = backupDir;
    process.env.BST_VIDEO_DIR = videoDir;
    process.env.BST_DISABLE_BROWSER_OPEN = '1';

    dbMock = {
      connectDB: vi.fn(async () => true),
      isConnected: vi.fn(() => true),
      loadDoc: vi.fn(async () => null),
      saveDoc: vi.fn(async () => true),
      upsertClassRecord: vi.fn(async (_classId, classData) => classData),
      deleteClassRecord: vi.fn(async () => true),
      upsertLessonPlanRecord: vi.fn(async (_planId, planData) => planData),
      deleteLessonPlanRecord: vi.fn(async () => true),
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

    delete process.env.BST_DATA_DIR;
    delete process.env.BST_BACKUP_DIR;
    delete process.env.BST_VIDEO_DIR;
    delete process.env.BST_DISABLE_BROWSER_OPEN;

    if (dbModulePath) {
      delete require.cache[dbModulePath];
    }
    delete require.cache[require.resolve('../../server')];

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('upserts a class via partial Mongo endpoint when connected', async () => {
    const response = await request(app)
      .put('/api/mongo/classes/class-99')
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

  it('deletes class via partial Mongo endpoint when connected', async () => {
    const response = await request(app)
      .delete('/api/mongo/classes/class-99')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.deleted).toBe(true);
    expect(dbMock.deleteClassRecord).toHaveBeenCalledWith('class-99', 'api-partial-delete');
  });

  it('upserts and deletes lesson plans via partial Mongo endpoints when connected', async () => {
    await request(app)
      .put('/api/mongo/lessonPlans/plan-22')
      .send({ id: 'plan-22', title: 'Connected Plan', classes: ['class-1'] })
      .expect(200);

    await request(app)
      .delete('/api/mongo/lessonPlans/plan-22')
      .expect(200);

    expect(dbMock.upsertLessonPlanRecord).toHaveBeenCalledWith(
      'plan-22',
      { id: 'plan-22', title: 'Connected Plan', classes: ['class-1'] },
      'api-partial-upsert'
    );
    expect(dbMock.deleteLessonPlanRecord).toHaveBeenCalledWith('plan-22', 'api-partial-delete');
  });

  it('supports legacy lessonplans Mongo routes and marks them deprecated', async () => {
    const upsertResponse = await request(app)
      .put('/api/mongo/lessonplans/plan-legacy')
      .send({ id: 'plan-legacy', title: 'Legacy Plan', classes: ['class-1'] })
      .expect(200);

    const deleteResponse = await request(app)
      .delete('/api/mongo/lessonplans/plan-legacy')
      .expect(200);

    expect(upsertResponse.headers.deprecation).toBe('true');
    expect(String(upsertResponse.headers.link || '')).toContain('/api/mongo/lessonPlans/plan-legacy');
    expect(deleteResponse.headers.deprecation).toBe('true');
    expect(String(deleteResponse.headers.link || '')).toContain('/api/mongo/lessonPlans/plan-legacy');
  });

  it('skips full Mongo sync on save endpoint when skip header is set', async () => {
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
      .set('x-bst-skip-cloud-sync', '1')
      .send(payload)
      .expect(200);

    expect(response.body.cloudSync?.state).toBe('skipped');
    expect(dbMock.saveDoc).not.toHaveBeenCalled();
  });
});
