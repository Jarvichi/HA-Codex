import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const usage = 'Usage: ha-codex-ha dashboard list | get <url-path|-> | create <url-path> <title> | save <url-path|-> <json-file>';

export async function command(args) {
  const [action, ...rest] = args;
  if (action === 'list' && rest.length === 0) return { type: 'lovelace/dashboards/list' };
  if (action === 'get' && rest.length === 1 && rest[0])
    return { type: 'lovelace/config', url_path: rest[0] === '-' ? null : rest[0] };
  if (action === 'create' && rest.length === 2 && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(rest[0]) && rest[1].trim())
    return { type: 'lovelace/dashboards/create', url_path: rest[0], title: rest[1], icon: 'mdi:view-dashboard', show_in_sidebar: true, require_admin: true, mode: 'storage' };
  if (action === 'save' && rest.length === 2 && rest[0] && rest[1]) {
    const config = JSON.parse(await readFile(rest[1], 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config) || !Array.isArray(config.views))
      throw new Error('Dashboard JSON must be an object with a views array.');
    return { type: 'lovelace/config/save', url_path: rest[0] === '-' ? null : rest[0], config };
  }
  throw new Error(usage);
}

export async function perform(request, token, Socket = WebSocket) {
  if (!token) throw new Error('Home Assistant API access is unavailable.');
  const ws = new Socket('ws://supervisor/core/websocket');
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Home Assistant WebSocket timed out.')), 30000);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      if (error) reject(error); else resolve(result);
    }
    ws.addEventListener('error', () => finish(new Error('Home Assistant WebSocket connection failed.')));
    ws.addEventListener('close', () => finish(new Error('Home Assistant WebSocket closed unexpectedly.')));
    ws.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        else if (message.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, ...request }));
        else if (message.type === 'auth_invalid') finish(new Error('Home Assistant authentication failed.'));
        else if (message.id === 1 && message.type === 'result') {
          if (!message.success) finish(new Error(`Dashboard request failed: ${message.error?.message || 'unknown error'}`));
          else finish(null, message.result);
        }
      } catch (error) { finish(error); }
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const request = await command(process.argv.slice(2));
    const result = await perform(request, process.env.SUPERVISOR_TOKEN);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
