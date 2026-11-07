import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

await mkdir('.tmp/tests', { recursive: true })
const tests = ['journal.test', 'convexJournal.test', 'connector.test']
await build({ entryPoints: tests.map((name) => `tests/${name}.ts`), outdir: '.tmp/tests', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, logLevel: 'warning' })
const result = spawnSync(process.execPath, ['--test', ...tests.map((name) => `.tmp/tests/${name}.cjs`)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
