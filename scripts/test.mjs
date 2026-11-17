import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tests = ['journal.test', 'convexJournal.test', 'connector.test', 'prints.test', 'printChart.test', 'executionPlans.test', 'printReview.test', 'convexPrintReviews.test']
const outputDir = await mkdtemp(join(tmpdir(), 'personal-fx-journal-tests-'))
try {
  await build({ entryPoints: tests.map((name) => `tests/${name}.ts`), outdir: outputDir, bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, logLevel: 'warning' })
  const result = spawnSync(process.execPath, ['--test', ...tests.map((name) => join(outputDir, `${name}.cjs`))], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally {
  await rm(outputDir, { recursive: true, force: true })
}
