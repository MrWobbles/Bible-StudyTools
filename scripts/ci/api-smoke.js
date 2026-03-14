#!/usr/bin/env node

const { spawn } = require('child_process');

const mode = process.argv.includes('--mode=heavy') ? 'heavy' : 'light';
const port = Number(process.env.CI_PORT || 3200 + Math.floor(Math.random() * 300));
const baseUrl = `http://127.0.0.1:${port}`;
const startupTimeoutMs = 30000;
const pollIntervalMs = 500;

let serverProcess = null;
let isStoppingServer = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }
  return { response, data };
}

async function waitForServerReady() {
  const start = Date.now();
  while (Date.now() - start < startupTimeoutMs) {
    try {
      const { response, data } = await fetchJson(`${baseUrl}/api/status`);
      if (response.ok && data && data.status === 'ok') {
        return data;
      }
    } catch (err) {
      // Retry until timeout.
    }
    await delay(pollIntervalMs);
  }

  throw new Error(`Server was not ready within ${startupTimeoutMs}ms on ${baseUrl}`);
}

function getServerStartCommand() {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm start']
    };
  }

  return {
    command: 'npm',
    args: ['start']
  };
}

function startServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(port),
      BST_DISABLE_BROWSER_OPEN: '1'
    };

    const starter = getServerStartCommand();
    serverProcess = spawn(starter.command, starter.args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let stderrBuffer = '';

    serverProcess.stderr.on('data', (chunk) => {
      const message = chunk.toString();
      stderrBuffer += message;
      process.stderr.write(`[server] ${message}`);
    });

    serverProcess.stdout.on('data', (chunk) => {
      process.stdout.write(`[server] ${chunk.toString()}`);
    });

    serverProcess.on('error', reject);
    serverProcess.on('spawn', () => resolve());
    serverProcess.on('exit', (code) => {
      if (!isStoppingServer && code !== 0 && code !== null) {
        process.stderr.write(`[server] exited with code ${code}\n`);
      }
      if (stderrBuffer.includes('EADDRINUSE')) {
        process.stderr.write('[server] Port conflict detected.\n');
      }
    });
  });
}

async function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  isStoppingServer = true;

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(serverProcess.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false
      });
      killer.on('error', () => resolve());
      killer.on('exit', () => resolve());
    });
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
      resolve();
    }, 5000);

    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    serverProcess.kill('SIGTERM');
  });

  isStoppingServer = false;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runLightChecks() {
  const status = await fetchJson(`${baseUrl}/api/status`);
  assert(status.response.ok, 'GET /api/status failed');
  assert(status.data?.status === 'ok', 'GET /api/status did not return status=ok');

  const classes = await fetchJson(`${baseUrl}/api/data/classes`);
  assert(classes.response.ok, 'GET /api/data/classes failed');
  assert(Array.isArray(classes.data?.classes), 'Classes payload missing classes[]');

  const plans = await fetchJson(`${baseUrl}/api/data/lessonplans`);
  assert(plans.response.ok, 'GET /api/data/lessonplans failed');
  assert(Array.isArray(plans.data?.lessonPlans), 'Lesson plans payload missing lessonPlans[]');

  const invalidSave = await fetchJson(`${baseUrl}/api/save/classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notClasses: true })
  });

  assert(invalidSave.response.status === 400, 'Invalid save payload should return HTTP 400');
}

async function runHeavyChecks() {
  const classesTextResponse = await fetch(`${baseUrl}/api/data/classes`);
  assert(classesTextResponse.ok, 'GET /api/data/classes failed before heavy checks');
  const classesRaw = await classesTextResponse.text();

  const plansTextResponse = await fetch(`${baseUrl}/api/data/lessonplans`);
  assert(plansTextResponse.ok, 'GET /api/data/lessonplans failed before heavy checks');
  const plansRaw = await plansTextResponse.text();

  const saveClasses = await fetchJson(`${baseUrl}/api/save/classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: classesRaw
  });
  assert(saveClasses.response.ok, 'POST /api/save/classes failed in heavy checks');
  assert(saveClasses.data?.success === true, 'Save classes did not return success=true');

  const savePlans = await fetchJson(`${baseUrl}/api/save/lessonplans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: plansRaw
  });
  assert(savePlans.response.ok, 'POST /api/save/lessonplans failed in heavy checks');
  assert(savePlans.data?.success === true, 'Save lesson plans did not return success=true');

  const backupCreate = await fetchJson(`${baseUrl}/api/backups/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: 'classes' })
  });
  assert(backupCreate.response.ok, 'POST /api/backups/create failed in heavy checks');
  assert(backupCreate.data?.backupFileName, 'Backup create did not return backupFileName');

  const restore = await fetchJson(`${baseUrl}/api/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backupFileName: backupCreate.data.backupFileName })
  });
  assert(restore.response.ok, 'POST /api/backups/restore failed in heavy checks');
  assert(restore.data?.success === true, 'Restore did not return success=true');

  const classesAfter = await fetchJson(`${baseUrl}/api/data/classes`);
  assert(classesAfter.response.ok, 'GET /api/data/classes failed after restore');
  assert(Array.isArray(classesAfter.data?.classes), 'Classes payload invalid after restore');
}

(async () => {
  try {
    process.stdout.write(`[smoke] Starting server for ${mode} checks on ${baseUrl}\n`);
    await startServer();
    const status = await waitForServerReady();
    process.stdout.write(`[smoke] Server ready (mongodb=${status.mongodb})\n`);

    await runLightChecks();
    process.stdout.write('[smoke] Light checks passed.\n');

    if (mode === 'heavy') {
      await runHeavyChecks();
      process.stdout.write('[smoke] Heavy checks passed.\n');
    }
  } catch (err) {
    process.stderr.write(`[smoke] ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    await stopServer();
  }
})();
