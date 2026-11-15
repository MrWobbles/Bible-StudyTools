const express = require('express');
const { requireAuthenticatedAccess } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_CHANNEL = 'class1-control';
const MAX_CHANNEL_LENGTH = 128;
const HEARTBEAT_INTERVAL_MS = 25000;

/** @type {Map<string, Set<import('express').Response>>} */
const channelClients = new Map();

function normalizeChannel(rawChannel) {
  if (typeof rawChannel !== 'string') {
    return '';
  }
  return rawChannel.trim().slice(0, MAX_CHANNEL_LENGTH);
}

function addClient(channel, res) {
  let clients = channelClients.get(channel);
  if (!clients) {
    clients = new Set();
    channelClients.set(channel, clients);
  }
  clients.add(res);
}

function removeClient(channel, res) {
  const clients = channelClients.get(channel);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) {
    channelClients.delete(channel);
  }
}

function broadcastToChannel(channel, command) {
  const clients = channelClients.get(channel);
  if (!clients || clients.size === 0) {
    return 0;
  }

  const payload = `data: ${JSON.stringify(command)}\n\n`;
  let notified = 0;

  for (const client of Array.from(clients)) {
    if (client.writableEnded || client.destroyed) {
      removeClient(channel, client);
      continue;
    }
    try {
      client.write(payload);
      notified += 1;
    } catch {
      removeClient(channel, client);
    }
  }

  return notified;
}

router.get('/api/display/events', (req, res) => {
  const channel = normalizeChannel(req.query?.channel) || DEFAULT_CHANNEL;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(': connected\n\n');
  addClient(channel, res);

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      removeClient(channel, res);
      return;
    }
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      removeClient(channel, res);
    }
  }, HEARTBEAT_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(channel, res);
  });
});

router.post('/api/display/command', requireAuthenticatedAccess, (req, res) => {
  const channel = normalizeChannel(req.body?.channel);
  const command = req.body?.command;

  if (!channel) {
    return res.status(400).json({ error: 'Display channel is required' });
  }
  if (!command || typeof command !== 'object' || typeof command.type !== 'string' || !command.type.trim()) {
    return res.status(400).json({ error: 'Command object with a valid type is required' });
  }

  const clientsNotified = broadcastToChannel(channel, command);
  return res.json({ success: true, channel, clientsNotified });
});

module.exports = router;
