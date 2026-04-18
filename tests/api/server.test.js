const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const request = require('supertest');

describe('server API', () => {
  let tempRoot;
  let videoDir;
  let app;
  let serverModule;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bst-api-test-'));
    videoDir = path.join(tempRoot, 'video');

    await fs.mkdir(videoDir, { recursive: true });

    process.env.BST_VIDEO_DIR = videoDir;
    process.env.BST_DISABLE_BROWSER_OPEN = '1';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    expect(response.body.supabase).toBe('disconnected');
  });

  it('rejects invalid save payloads', async () => {
    const response = await request(app)
      .post('/api/save/classes')
      .send({ nope: true })
      .expect(400);

    expect(response.body.error).toBe('Invalid classes payload');
    expect(Array.isArray(response.body.details)).toBe(true);
  });

  it('supports legacy lessonplans save route, marks it deprecated, and enforces Supabase availability', async () => {
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
      .expect(503);

    expect(response.headers.deprecation).toBe('true');
    expect(String(response.headers.link || '')).toContain('/api/save/lessonPlans');
    expect(response.body.error).toContain('Supabase is disconnected');
  });

  it('returns 503 when saving classes while Supabase is unavailable', async () => {
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
      .expect(503);

    expect(response.body.error).toContain('Supabase is disconnected');
  });

  it('returns 503 for partial Supabase class upsert when Supabase is disconnected', async () => {
    const response = await request(app)
      .put('/api/supabase/classes/class-1')
      .send({ id: 'class-1', title: 'Partial Update' })
      .expect(503);

    expect(response.body.error).toContain('Supabase is disconnected');
    expect(response.body.supabase).toBe('disconnected');
  });

  it('returns 503 for partial Supabase lesson plan delete when Supabase is disconnected', async () => {
    const response = await request(app)
      .delete('/api/supabase/lessonPlans/lesson-1')
      .expect(503);

    expect(response.body.error).toContain('Supabase is disconnected');
    expect(response.body.supabase).toBe('disconnected');
  });

  it('returns 503 when skip-cloud-sync header is sent but Supabase is unavailable', async () => {
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
      .expect(503);

    expect(response.body.error).toContain('Supabase is disconnected');
  });
});
