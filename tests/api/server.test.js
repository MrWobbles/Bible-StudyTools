const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const request = require('supertest');

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

describe('server API', () => {
  let tempRoot;
  let dataDir;
  let backupDir;
  let videoDir;
  let app;
  let serverModule;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bst-api-test-'));
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
    delete process.env.MONGODB_URI;

    vi.resetModules();
    delete require.cache[require.resolve('../../server')];
    delete require.cache[require.resolve('../../db')];
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
    delete require.cache[require.resolve('../../server')];
    delete require.cache[require.resolve('../../db')];

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns API status', async () => {
    const response = await request(app)
      .get('/api/status')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.mongodb).toBe('disconnected');
  });

  it('rejects invalid save payloads', async () => {
    const response = await request(app)
      .post('/api/save/classes')
      .send({ nope: true })
      .expect(400);

    expect(response.body.error).toBe('Invalid classes payload');
    expect(Array.isArray(response.body.details)).toBe(true);
  });

  it('rejects class records that violate field constraints', async () => {
    const response = await request(app)
      .post('/api/save/classes')
      .send({
        classes: [
          {
            id: 'class-1',
            title: 'x'.repeat(241),
            outline: [],
            media: []
          }
        ]
      })
      .expect(400);

    expect(response.body.error).toBe('Invalid classes payload');
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details.some((issue) => String(issue.path || '').includes('title'))).toBe(true);
  });

  it('rejects lesson plan class references that violate schema constraints', async () => {
    const response = await request(app)
      .post('/api/save/lessonPlans')
      .send({
        lessonPlans: [
          {
            id: 'plan-1',
            title: 'Plan',
            classes: ['']
          }
        ]
      })
      .expect(400);

    expect(response.body.error).toBe('Invalid lesson plans payload');
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details.some((issue) => String(issue.path || '').includes('classes'))).toBe(true);
  });

  it('supports legacy lessonplans save route and marks it deprecated', async () => {
    const payload = {
      lessonPlans: [
        {
          id: 'lesson-1',
          title: 'Legacy Save Route',
          classes: ['class-1']
        }
      ]
    };

    const response = await request(app)
      .post('/api/save/lessonplans')
      .send(payload)
      .expect(200);

    expect(response.headers.deprecation).toBe('true');
    expect(String(response.headers.link || '')).toContain('/api/save/lessonPlans');
    expect(response.body.success).toBe(true);
  });

  it('adds a request id header for API write requests', async () => {
    const response = await request(app)
      .post('/api/save/classes')
      .send({
        classes: [
          {
            id: 'class-1',
            title: 'Request Id Check',
            outline: [],
            media: []
          }
        ]
      })
      .expect(200);

    expect(typeof response.headers['x-request-id']).toBe('string');
    expect(response.headers['x-request-id'].length).toBeGreaterThan(10);
  });

  it('saves classes and reports degraded cloud sync when MongoDB is unavailable', async () => {
    const payload = {
      classes: [
        {
          id: 'class-1',
          title: 'Updated Title',
          outline: [{ id: 'sec-1', summary: 'Updated section' }],
          media: []
        }
      ]
    };

    const response = await request(app)
      .post('/api/save/classes')
      .send(payload)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.partialSuccess).toBe(true);
    expect(response.body.cloudSync.state).toBe('disconnected');

    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'classes.json'), 'utf8'));
    expect(saved).toEqual(payload);

    const backups = await fs.readdir(backupDir);
    expect(backups.some((fileName) => fileName.startsWith('classes_'))).toBe(true);
  });

  it('restores a backup after a save', async () => {
    const originalPayload = JSON.parse(await fs.readFile(path.join(dataDir, 'classes.json'), 'utf8'));

    const saveResponse = await request(app)
      .post('/api/save/classes')
      .send({
        classes: [
          {
            id: 'class-1',
            title: 'Changed Before Restore',
            outline: [],
            media: []
          }
        ]
      })
      .expect(200);

    expect(saveResponse.body.backup).toBeTruthy();

    const restoreResponse = await request(app)
      .post('/api/backups/restore')
      .send({ backupFileName: saveResponse.body.backup })
      .expect(200);

    expect(restoreResponse.body.success).toBe(true);
    expect(restoreResponse.body.partialSuccess).toBe(true);
    expect(restoreResponse.body.cloudSync.state).toBe('disconnected');

    const restored = JSON.parse(await fs.readFile(path.join(dataDir, 'classes.json'), 'utf8'));
    expect(restored).toEqual(originalPayload);
  });

  it('returns 503 for partial Mongo class upsert when MongoDB is disconnected', async () => {
    const response = await request(app)
      .put('/api/mongo/classes/class-1')
      .send({ id: 'class-1', title: 'Partial Update' })
      .expect(503);

    expect(response.body.error).toContain('MongoDB is disconnected');
    expect(response.body.mongodb).toBe('disconnected');
  });

  it('returns 503 for partial Mongo lesson plan delete when MongoDB is disconnected', async () => {
    const response = await request(app)
      .delete('/api/mongo/lessonPlans/lesson-1')
      .expect(503);

    expect(response.body.error).toContain('MongoDB is disconnected');
    expect(response.body.mongodb).toBe('disconnected');
  });

  it('allows local save with cloud sync explicitly skipped', async () => {
    const payload = {
      classes: [
        {
          id: 'class-1',
          title: 'Skip Cloud Sync',
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

    expect(response.body.success).toBe(true);
    expect(response.body.partialSuccess).toBeUndefined();
    expect(response.body.cloudSync?.state).toBe('skipped');

    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'classes.json'), 'utf8'));
    expect(saved).toEqual(payload);
  });
});
