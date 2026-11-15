import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const displaySyncRouter = require('../../server/routes/displaySync');

function findRouteHandler(method, routePath) {
  const layer = displaySyncRouter.stack.find(
    (entry) => entry.route && entry.route.path === routePath && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`);
  }
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function createMockSseResponse() {
  const res = new EventEmitter();
  res.headers = {};
  res.chunks = [];
  res.writableEnded = false;
  res.destroyed = false;
  res.setHeader = (key, value) => {
    res.headers[key.toLowerCase()] = value;
  };
  res.flushHeaders = () => {};
  res.write = (chunk) => {
    res.chunks.push(String(chunk));
    return true;
  };
  return res;
}

function createMockJsonResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('display sync SSE relay', () => {
  const eventsHandler = findRouteHandler('get', '/api/display/events');
  const commandHandler = findRouteHandler('post', '/api/display/command');

  it('delivers commands only to SSE clients subscribed to the matching channel and cleans up on close', () => {
    const req1 = new EventEmitter();
    req1.query = { channel: 'class1-control' };
    const res1 = createMockSseResponse();
    eventsHandler(req1, res1);

    const req2 = new EventEmitter();
    req2.query = { channel: 'class2-control' };
    const res2 = createMockSseResponse();
    eventsHandler(req2, res2);

    expect(res1.headers['content-type']).toBe('text/event-stream');
    expect(res1.chunks[0]).toBe(': connected\n\n');

    const command = {
      type: 'displayMedia',
      media: { type: 'verse', reference: 'John 3:16' },
      sentAt: 1700000000000,
    };

    const postRes = createMockJsonResponse();
    commandHandler({ body: { channel: 'class1-control', command } }, postRes);

    expect(postRes.statusCode).toBe(200);
    expect(postRes.body).toEqual({
      success: true,
      channel: 'class1-control',
      clientsNotified: 1,
    });

    expect(res1.chunks).toContain(`data: ${JSON.stringify(command)}\n\n`);
    expect(res2.chunks).toEqual([': connected\n\n']);

    req1.emit('close');
    req2.emit('close');

    const afterCloseRes = createMockJsonResponse();
    commandHandler({ body: { channel: 'class1-control', command } }, afterCloseRes);
    expect(afterCloseRes.body.clientsNotified).toBe(0);
  });

  it('rejects missing channel or command type', () => {
    const missingChannelRes = createMockJsonResponse();
    commandHandler({ body: { channel: '', command: { type: 'clearScreen' } } }, missingChannelRes);
    expect(missingChannelRes.statusCode).toBe(400);

    const missingTypeRes = createMockJsonResponse();
    commandHandler({ body: { channel: 'class1-control', command: {} } }, missingTypeRes);
    expect(missingTypeRes.statusCode).toBe(400);
  });
});
