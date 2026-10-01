// Source-preserving local transfer. Existing target edits are never overwritten.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
if (args.some(arg => arg.startsWith('--') && arg !== '--dry-run')) throw new Error('Unknown option')
const source = path.resolve(args.find(arg => arg !== '--dry-run') ?? 'C:/play-games')
if (root === source) throw new Error('Source and destination must differ')
if (!fs.statSync(source).isDirectory()) throw new Error('Source must be a directory')
const inventoryPath = path.join(root, 'artifacts/alien-run-transfer.json')
const previous = fs.existsSync(inventoryPath)
  ? JSON.parse(fs.readFileSync(inventoryPath, 'utf8')).files : {}
const mappings = [
  ['games/alien-run/UnityProject/Assets', 'games/alien-run/UnityProject/Assets'],
  ['games/alien-run/UnityProject/Packages', 'games/alien-run/UnityProject/Packages'],
  ['games/alien-run/UnityProject/ProjectSettings', 'games/alien-run/UnityProject/ProjectSettings'],
  ['packages/unity-sdk', 'packages/unity-sdk'],
  ['games/alien-run/DESIGN.md', 'games/alien-run/DESIGN.md'],
  ['docs/ALIEN-RUN-COMPLETE-LEVEL.md', 'games/alien-run/docs/COMPLETE-LEVEL.md'],
  ['docs/ALIEN-RUN-V8.md', 'games/alien-run/docs/V8.md'],
  ['docs/KAYKIT-INVENTORY.md', 'games/alien-run/docs/KAYKIT-INVENTORY.md'],
  ['catalog/alien-run.json', 'games/alien-run/source-manifest.json'],
]
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const files = {}, conflicts = [], pending = []
let copied = 0, unchanged = 0
function transfer(input, output) {
  const stat = fs.lstatSync(input)
  if (stat.isSymbolicLink()) throw new Error(`Symbolic source excluded: ${input}`)
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(input)) transfer(path.join(input, child), path.join(output, child))
    return
  }
  const relative = path.relative(root, output).replaceAll('\\', '/')
  const bytes = fs.readFileSync(input), digest = hash(bytes)
  if (fs.existsSync(output)) {
    const targetHash = hash(fs.readFileSync(output))
    if (targetHash === digest) { unchanged++; files[relative] = digest; return }
    if (targetHash !== previous[relative]) {
      conflicts.push(relative); files[relative] = previous[relative] ?? null; return
    }
  }
  if (dryRun) {
    pending.push({ path: relative, action: fs.existsSync(output) ? 'update' : 'copy', sha256: digest })
    return
  }
  // Recheck the live source before writing a snapshot of it.
  if (hash(fs.readFileSync(input)) !== digest) throw new Error(`Source changed during transfer: ${input}`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, bytes)
  if (hash(fs.readFileSync(output)) !== digest) throw new Error(`Transfer mismatch: ${relative}`)
  files[relative] = digest; copied++
}
for (const [input, output] of mappings) {
  const absolute = path.join(source, input)
  if (fs.existsSync(absolute)) transfer(absolute, path.join(root, output))
}
if (!dryRun) {
  fs.mkdirSync(path.dirname(inventoryPath), { recursive: true })
  fs.writeFileSync(inventoryPath, JSON.stringify({source, destination:root, timestamp:new Date().toISOString(),copied,unchanged,conflicts,files},null,2)+'\n')
}
console.log(JSON.stringify({source, destination:root, dryRun, copied,unchanged,conflicts,pending,inventoryPath}))
if (conflicts.length) process.exitCode = 1
