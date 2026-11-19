/** Owned, loopback-only real Auth/Storage recovery target. Never uses the shared local project. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve('artifacts/rm13/stack');
mkdirSync(resolve(root, 'supabase'), { recursive: true });
let config = readFileSync('supabase/config.toml', 'utf8');
config = config.replace('project_id = "torneos"', 'project_id = "torneos-rm13-recovery"');
for (const [from, to] of [[54321, 23421], [15432, 23422], [54320, 23420], [54323, 23423], [54324, 23424], [54329, 23429]]) {
  config = config.replaceAll(`= ${from}`, `= ${to}`);
}
config = config.replace(/(\[db.migrations\][\s\S]*?)enabled = true/, '$1enabled = false')
  .replace(/schema_paths = .*/, 'schema_paths = []').replace(/sql_paths = .*/, 'sql_paths = []')
  .replace(/(\[(?:realtime|studio|edge_runtime)\]\s*)enabled = true/g, '$1enabled = false')
  .replace('site_url = "http://127.0.0.1:3081"', 'site_url = "http://127.0.0.1:23431"');
writeFileSync(resolve(root, 'supabase/config.toml'), config);
const inspect = spawnSync('docker', ['network', 'inspect', 'torneos-rm13-recovery'], { encoding: 'utf8', windowsHide: true });
if (inspect.status !== 0 || JSON.parse(inspect.stdout)[0].Options['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') {
  throw new Error('Create the owned Docker network with host_binding_ipv4=127.0.0.1 first');
}
console.log(JSON.stringify({ project: 'torneos-rm13-recovery', workdir: root, apiPort: 23421, dbPort: 23422, sharedProjectUntouched: true }));
