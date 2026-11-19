// Preserve Unix ownership across Docker archive copies on Windows (NTFS loses it).
import { binaryRun, run, PROJECT } from './rm13-recovery-lib.mjs';
const name = `supabase_kong_${PROJECT}`;
const image = JSON.parse((await run('docker', ['inspect', name])).out)[0].Config.Image;
const id = await run('docker', ['run', '--rm', '--network', 'none', '--name', 'rm13-kong-identity', '--entrypoint', 'id', image, '-u', 'kong']);
if (id.code || !/^\d+\s*$/.test(id.out)) throw new Error('Cannot determine gateway owner');
const uid = Number(id.out.trim());
await run('docker', ['stop', name]);
const archive = await binaryRun('docker', ['cp', `${name}:/home/kong/.`, '-']);
if (archive.code) throw new Error('Cannot archive owned gateway');
const tar = archive.out;
for (let offset = 0; offset + 512 <= tar.length; ) {
  const header = tar.subarray(offset, offset + 512);
  if (header.every(x => x === 0)) break;
  const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
  for (const pos of [108, 116]) header.write(uid.toString(8).padStart(7, '0') + '\0', pos, 8, 'ascii');
  header.fill(32, 148, 156);
  const sum = header.reduce((a, b) => a + b, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  offset += 512 + Math.ceil(size / 512) * 512;
}
const copy = await binaryRun('docker', ['cp', '--archive', '-', `${name}:/home/kong`], tar);
if (copy.code) throw new Error('Cannot recover owned gateway file permissions');
if ((await run('docker', ['start', name])).code) throw new Error('Cannot start owned gateway');
console.log(JSON.stringify({ status: 'PASS', owner: uid, preservedContainerUser: 'kong', target: name }));
