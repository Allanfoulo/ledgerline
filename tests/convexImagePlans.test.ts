import { test } from 'node:test'
import assert from 'node:assert/strict'
import { add, createUploadUrl, draftContext, list, remove, setDraftContext, strategyChoices, versionEvidence } from '../convex/planImages'

type Row = Record<string, any> & { _id: string; _table: string }

function mockContext(subject: string | null, seed: Array<{ table: string; id: string; value: Record<string, unknown> }> = []) {
  const rows = new Map<string, Row>()
  for (const item of seed) rows.set(item.id, { ...item.value, _id: item.id, _table: item.table })
  const files = new Map<string, Blob>()
  const metadata = new Map<string, { size: number; contentType: string }>()
  const deletedStorage: string[] = []
  let nextId = 0
  const ctx = {
    auth: { getUserIdentity: async () => subject ? { subject } : null },
    db: {
      get: async (id: string) => rows.get(id) ?? null,
      system: { get: async (_table: string, id: string) => metadata.get(id) ?? null },
      query: (table: string) => ({ withIndex: (_name: string, callback: (query: any) => unknown) => {
        const conditions: Array<{ field: string; operator: 'eq' | 'gte' | 'lt'; value: unknown }> = []
        const query = {
          eq: (field: string, value: unknown) => { conditions.push({ field, operator: 'eq', value }); return query },
          gte: (field: string, value: unknown) => { conditions.push({ field, operator: 'gte', value }); return query },
          lt: (field: string, value: unknown) => { conditions.push({ field, operator: 'lt', value }); return query },
        }
        callback(query)
        const matches = () => [...rows.values()].filter((row) => row._table === table && conditions.every(({ field, operator, value }) => {
          const actual = row[field]
          if (operator === 'eq') return actual === value
          if (operator === 'gte') return String(actual) >= String(value)
          return String(actual) < String(value)
        }))
        return { collect: async () => matches(), unique: async () => { const found = matches(); if (found.length > 1) throw new Error('Expected a unique row'); return found[0] ?? null } }
      } }),
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}-${++nextId}`
        rows.set(id, { ...value, _id: id, _table: table })
        return id
      },
      patch: async (id: string, value: Record<string, unknown>) => {
        const current = rows.get(id)
        if (!current) throw new Error('Not found')
        const next = { ...current, ...value }
        for (const [key, field] of Object.entries(value)) if (field === undefined) delete next[key]
        rows.set(id, next)
      },
      delete: async (id: string) => { rows.delete(id) },
    },
    storage: {
      generateUploadUrl: async () => 'https://upload.example/one-time-token',
      store: async (blob: Blob) => {
        const id = `storage-${++nextId}`
        files.set(id, blob)
        metadata.set(id, { size: blob.size, contentType: blob.type })
        return id
      },
      get: async (id: string) => files.get(id) ?? null,
      delete: async (id: string) => { deletedStorage.push(id); files.delete(id); metadata.delete(id) },
    },
  }
  return { ctx, rows, files, metadata, deletedStorage }
}

function seedDraft() {
  return [{ table: 'executionPlans', id: 'plan-a', value: { owner: 'user-a', status: 'draft', revision: 0 } }]
}

function validPng() { return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]) }
function validJpeg() { return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }

async function attachPng(ctx: any, files: Map<string, Blob>, metadata: Map<string, { size: number; contentType: string }>) {
  const upload = await (createUploadUrl as any)._handler(ctx, { planId: 'plan-a' })
  const storageId = 'original-png'
  const original = new Blob([validPng()], { type: 'image/png' })
  files.set(storageId, original)
  metadata.set(storageId, { size: original.size, contentType: original.type })
  const previewBase64 = Buffer.from(validJpeg()).toString('base64')
  return (add as any)._handler(ctx, { planId: 'plan-a', reservationId: upload.reservationId, storageId, previewBase64 })
}

test('private Convex upload flow validates owner, image type, size, and stores a separate preview', async () => {
  const own = mockContext('user-a', seedDraft())
  const attached = await attachPng(own.ctx, own.files, own.metadata)
  assert.ok(attached.imageId)
  const image = own.rows.get(attached.imageId)
  assert.equal(image?.storageId, 'original-png')
  assert.equal(image?.mimeType, 'image/png')
  assert.equal(image?.size, validPng().length)
  assert.notEqual(image?.previewStorageId, 'original-png')
  const images = await (list as any)._handler(own.ctx, { planId: 'plan-a' })
  assert.equal(images.length, 1)
  assert.equal(images[0].size, validPng().length)

  const foreign = mockContext('user-b', [...seedDraft(), { table: 'pendingPlanUploads', id: 'upload-a', value: { owner: 'user-a', planId: 'plan-a', createdAt: Date.now(), expiresAt: Date.now() + 60_000 } }])
  foreign.rows.set('plan-a', own.rows.get('plan-a')!)
  await assert.rejects(() => (add as any)._handler(foreign.ctx, { planId: 'plan-a', reservationId: 'upload-a', storageId: 'original-png', previewBase64: Buffer.from(validJpeg()).toString('base64') }), /reservation not found/)
  await assert.rejects(() => (list as any)._handler(foreign.ctx, { planId: 'plan-a' }), /Plan not found/)
})

test('invalid and oversized uploads are rejected and their reserved storage is discarded', async () => {
  const state = mockContext('user-a', seedDraft())
  const upload = await (createUploadUrl as any)._handler(state.ctx, { planId: 'plan-a' })
  state.files.set('bad-file', new Blob(['not an image'], { type: 'image/png' }))
  state.metadata.set('bad-file', { size: 12, contentType: 'image/png' })
  const result = await (add as any)._handler(state.ctx, { planId: 'plan-a', reservationId: upload.reservationId, storageId: 'bad-file', previewBase64: Buffer.from(validJpeg()).toString('base64') })
  assert.match(result.error, /not a supported image/)
  assert.ok(state.deletedStorage.includes('bad-file'))

  const tooLargeUpload = await (createUploadUrl as any)._handler(state.ctx, { planId: 'plan-a' })
  state.files.set('large-file', new Blob([new Uint8Array(1)]))
  state.metadata.set('large-file', { size: 9 * 1024 * 1024, contentType: 'image/png' })
  const oversized = await (add as any)._handler(state.ctx, { planId: 'plan-a', reservationId: tooLargeUpload.reservationId, storageId: 'large-file', previewBase64: Buffer.from(validJpeg()).toString('base64') })
  assert.match(oversized.error, /smaller than 8 MB/)
  assert.ok(state.deletedStorage.includes('large-file'))
})

test('strategy choices are owner-scoped and draft evidence changes use an optimistic revision', async () => {
  const rows = [
    ...seedDraft(),
    { table: 'strategies', id: 'strategy-a', value: { owner: 'user-a', name: 'ISX', description: 'Structure shifts', rules: ['Wait for S2'] } },
    { table: 'strategyVersions', id: 'strategy-v1', value: { owner: 'user-a', strategyId: 'strategy-a', version: 1, name: 'ISX', description: 'Structure shifts', rules: ['Wait for S2'], signals: [{ name: 'S1', description: 'First shift' }], committedAt: 1 } },
    { table: 'strategyVersions', id: 'strategy-foreign', value: { owner: 'user-b', strategyId: 'strategy-b', version: 1, name: 'Private', description: '', rules: [], signals: [], committedAt: 1 } },
  ]
  const own = mockContext('user-a', rows)
  const choices = await (strategyChoices as any)._handler(own.ctx, {})
  assert.deepEqual(choices.map((choice: any) => choice.id), ['strategy-v1'])
  const nextRevision = await (setDraftContext as any)._handler(own.ctx, { planId: 'plan-a', expectedRevision: 0, strategyVersionId: 'strategy-v1' })
  assert.equal(nextRevision, 1)
  assert.equal(own.rows.get('plan-a')?.revision, 1)
  assert.equal((await (draftContext as any)._handler(own.ctx, { planId: 'plan-a' })).strategyVersionId, 'strategy-v1')
  await assert.rejects(() => (setDraftContext as any)._handler(own.ctx, { planId: 'plan-a', expectedRevision: 0 }), /another session/)
  await assert.rejects(() => (setDraftContext as any)._handler(own.ctx, { planId: 'plan-a', expectedRevision: 1, strategyVersionId: 'strategy-foreign' }), /Strategy version not found/)
})

test('analysis records and committed evidence retain the exact image, strategy, and provider provenance', async () => {
  const rows = [
    ...seedDraft(),
    { table: 'planImages', id: 'image-a', value: { owner: 'user-a', planId: 'plan-a', storageId: 'original', previewStorageId: 'preview', mimeType: 'image/png', size: 9, createdAt: 1 } },
    { table: 'strategies', id: 'strategy-a', value: { owner: 'user-a', name: 'ISX', description: 'Structure shifts', rules: ['Wait for S2'] } },
    { table: 'strategyVersions', id: 'strategy-v1', value: { owner: 'user-a', strategyId: 'strategy-a', version: 1, name: 'ISX', description: 'Structure shifts', rules: ['Wait for S2'], signals: [{ name: 'S1', description: 'First shift' }], committedAt: 1 } },
  ]
  const own = mockContext('user-a', rows)
  const suggestions = { instrument: { value: 'XAU/USD', basis: 'visible', evidence: 'Chart title' }, signals: [{ value: 'S1', basis: 'visible', evidence: 'Label S1', signalName: 'S1', location: { xPercent: 50, yPercent: 41 } }] }
  const nextRevision = await (setDraftContext as any)._handler(own.ctx, { planId: 'plan-a', expectedRevision: 0, strategyVersionId: 'strategy-v1', analysis: { imageId: 'image-a', provider: 'google', model: 'gemma-4-26b-a4b-it', suggestions } })
  assert.equal(nextRevision, 1)
  const analysisId = [...own.rows.values()].find((row) => row._table === 'planAnalysisRuns')?._id
  assert.ok(analysisId)
  const selection = await (draftContext as any)._handler(own.ctx, { planId: 'plan-a' })
  assert.equal(selection.analysis.provider, 'google')
  assert.equal(selection.analysis.model, 'gemma-4-26b-a4b-it')

  own.rows.set('plan-v1', { _id: 'plan-v1', _table: 'executionPlanVersions', owner: 'user-a', planId: 'plan-a' })
  own.rows.set('link-image', { _id: 'link-image', _table: 'planVersionImages', owner: 'user-a', planId: 'plan-a', planVersionId: 'plan-v1', imageId: 'image-a' })
  own.rows.set('link-strategy', { _id: 'link-strategy', _table: 'planVersionStrategies', owner: 'user-a', planId: 'plan-a', planVersionId: 'plan-v1', strategyVersionId: 'strategy-v1' })
  own.rows.set('link-analysis', { _id: 'link-analysis', _table: 'planVersionAnalyses', owner: 'user-a', planId: 'plan-a', planVersionId: 'plan-v1', analysisRunId: analysisId })
  const evidence = await (versionEvidence as any)._handler(own.ctx, { planVersionId: 'plan-v1' })
  assert.deepEqual(evidence.imageIds, ['image-a'])
  assert.equal(evidence.strategy.name, 'ISX')
  assert.equal(evidence.strategy.signals[0].name, 'S1')
  assert.equal(evidence.analysis.provider, 'google')
  assert.equal(evidence.analysis.suggestions.signals[0].location.xPercent, 50)
})

test('discarded chart suggestions are never persisted as accepted plan evidence', async () => {
  const own = mockContext('user-a', [...seedDraft(), { table: 'planImages', id: 'image-a', value: { owner: 'user-a', planId: 'plan-a', storageId: 'original', previewStorageId: 'preview', mimeType: 'image/png', size: 9, createdAt: 1 } }])
  await (setDraftContext as any)._handler(own.ctx, { planId: 'plan-a', expectedRevision: 0 })
  assert.equal([...own.rows.values()].filter((row) => row._table === 'planAnalysisRuns').length, 0)
})

test('an image cannot be removed after commitment, preserving its versioned evidence reference', async () => {
  const rows = [...seedDraft(), { table: 'planImages', id: 'image-a', value: { owner: 'user-a', planId: 'plan-a', storageId: 'original', previewStorageId: 'preview', mimeType: 'image/png', size: 8, createdAt: 1 } }]
  const state = mockContext('user-a', rows)
  state.rows.set('plan-a', { ...state.rows.get('plan-a')!, status: 'committed' })
  await assert.rejects(() => (remove as any)._handler(state.ctx, { imageId: 'image-a' }), /Draft image not found/)
  assert.equal(state.rows.has('image-a'), true)
})
