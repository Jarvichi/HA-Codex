import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command, perform } from '../home_assistant_codex_app/ha-codex-dashboard.mjs';

test('commands validate input and construct Lovelace requests', async () => {
  assert.deepEqual(await command(['get', '-']), { type: 'lovelace/config', url_path: null });
  assert.equal((await command(['create', 'to-be-deleted', 'To Be Deleted'])).require_admin, true);
  await assert.rejects(command(['create', 'bad', 'Title']));
  const dir = await mkdtemp(join(tmpdir(), 'ha-dashboard-'));
  try {
    const file = join(dir, 'config.json');
    await writeFile(file, JSON.stringify({ views: [{ title: 'Test' }] }));
    assert.equal((await command(['save', 'house-agents', file])).config.views[0].title, 'Test');
    await writeFile(file, '{}');
    await assert.rejects(command(['save', 'house-agents', file]), /views array/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('authenticates and returns the matching result', async () => {
  class Socket {
    constructor() { this.listeners = {}; queueMicrotask(() => this.emit({ type: 'auth_required' })); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    emit(message) { this.listeners.message({ data: JSON.stringify(message) }); }
    send(raw) {
      const message = JSON.parse(raw);
      if (message.type === 'auth') {
        assert.equal(message.access_token, 'test-token');
        queueMicrotask(() => this.emit({ type: 'auth_ok' }));
      } else {
        assert.equal(message.type, 'lovelace/dashboards/list');
        queueMicrotask(() => this.emit({ id: 1, type: 'result', success: true, result: ['ok'] }));
      }
    }
    close() {}
  }
  assert.deepEqual(await perform(await command(['list']), 'test-token', Socket), ['ok']);
  await assert.rejects(perform({}, '', Socket), /unavailable/);
});
