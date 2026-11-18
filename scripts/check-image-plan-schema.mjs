import { readFile } from 'node:fs/promises'

const schema = await readFile(new URL('../convex/schema.ts', import.meta.url), 'utf8')
for (const table of ['planImages', 'pendingPlanUploads', 'planAnalysisRuns', 'strategyVersions', 'planStrategySelections', 'planVersionStrategies', 'planVersionImages', 'planVersionAnalyses', 'executionPlans', 'executionPlanVersions']) {
  if (!schema.includes(`${table}: defineTable`)) throw new Error(`Missing chart-plan table: ${table}`)
}
console.log('Image-assisted plan storage and version tables are present.')
