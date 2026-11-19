// Docker Desktop did not honor the network's default bind address. Recreate only
// owned containers with explicit loopback bindings, retaining every mounted volume.
import http from 'node:http';
import { run, PROJECT, PRIVATE } from './rm13-recovery-lib.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const r = await run('docker', ['context', 'inspect']);
const endpoint = JSON.parse(r.out)[0].Endpoints.docker.Host;
if (!endpoint.startsWith('npipe://')) throw new Error('This helper requires Docker Desktop named pipe');
const socketPath = endpoint.replace('npipe:////./pipe/', '\\\\.\\pipe\\');
async function api(method, path, value) {
  return new Promise((resolve, reject) => {
    const body = value === undefined ? undefined : JSON.stringify(value);
    const req = http.request({ socketPath, path: `/v1.48${path}`, method, headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, response => {
      let out = ''; response.on('data', x => { out += x; });
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 305 ? resolve(out ? JSON.parse(out) : null) : reject(new Error(`Owned Docker operation failed (${response.statusCode})`)));
    });
    req.on('error', reject); req.end(body);
  });
}
const containers = await api('GET', '/containers/json?all=true');
const owned = containers.filter(c => c.Names.some(n => n.endsWith(`_${PROJECT}`)));
if (!owned.length || owned.some(c => !c.Names[0].startsWith('/supabase_'))) throw new Error('No owned Supabase containers');
await mkdir(PRIVATE, { recursive: true });
const snapshots = [];
for (const c of owned) snapshots.push(await api('GET', `/containers/${c.Id}/json`));
await writeFile(resolve(PRIVATE, 'docker-owned-config.json'), JSON.stringify(snapshots), { mode: 0o600 });
const kong = snapshots.find(c => c.Name.startsWith('/supabase_kong_'));
if (kong) {
  const copied = await run('docker', ['cp', `${kong.Id}:/home/kong`, resolve(PRIVATE, 'kong-config')]);
  if (copied.code) throw new Error('Cannot preserve owned gateway files');
}
for (const c of snapshots) if (c.State.Running) await api('POST', `/containers/${c.Id}/stop?t=20`);
for (const c of snapshots) {
  const name = c.Name.slice(1);
  if (!name.endsWith(`_${PROJECT}`)) throw new Error('Unexpected container');
  const config = { ...c.Config, HostConfig: { ...c.HostConfig } };
  config.HostConfig.PortBindings = Object.fromEntries(Object.entries(c.HostConfig.PortBindings ?? {}).map(([port, bindings]) => [port, bindings.map(b => ({ ...b, HostIp: '127.0.0.1' }))]));
  // Preserve named/anonymous mounts explicitly when Config.Volumes created them.
  config.HostConfig.Binds = c.Mounts.map(m => `${m.Type === 'volume' ? m.Name : m.Source}:${m.Destination}${m.RW ? '' : ':ro'}`);
  config.HostConfig.Mounts = [];
  config.HostConfig.NetworkMode = PROJECT;
  config.NetworkingConfig = { EndpointsConfig: { [PROJECT]: { Aliases: [...new Set([name, ...(c.NetworkSettings.Networks[PROJECT]?.Aliases ?? [])])] } } };
  delete config.HostConfig.ContainerIDFile;
  await api('DELETE', `/containers/${c.Id}`); // no volume deletion
  await api('POST', `/containers/create?name=${encodeURIComponent(name)}`, config);
  if (c.Id === kong?.Id) {
    const copied = await run('docker', ['cp', resolve(PRIVATE, 'kong-config') + '/.', `${name}:/home/kong`]);
    if (copied.code) throw new Error('Cannot restore owned gateway files');
  }
}
const sorted = snapshots.sort((a, b) => Number(b.Name.startsWith('/supabase_db_')) - Number(a.Name.startsWith('/supabase_db_')));
for (const c of sorted) await api('POST', `/containers/${c.Name.slice(1)}/start`);
if (kong) {
  const permissions = await run(process.execPath, ['scripts/rm13-repair-gateway.mjs']);
  if (permissions.code) throw new Error('Gateway Unix ownership recovery failed');
}
console.log(JSON.stringify({ status: 'PASS', recreated: owned.length, binding: '127.0.0.1', volumesPreserved: true, sharedProjectUntouched: true }));
