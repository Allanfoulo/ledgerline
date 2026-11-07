import { supportedPairs, tradeFingerprint, validateTrade } from '../domain/trade'
import type { Pair, TradeInput } from '../domain/trade'

export const columns = ['date', 'exitDate', 'pair', 'side', 'lots', 'entry', 'exit', 'entryTime', 'exitTime', 'commission', 'swap', 'setup'] as const
export type Column = typeof columns[number]
export type Mapping = Record<Column, number>
export type PreviewRow = { line: number; input?: TradeInput; errors: string[]; duplicate: boolean }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closedQuote = false
  const value = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (quoted) {
      if (char === '"' && value[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') { quoted = false; closedQuote = true }
      else cell += char
    } else if (char === '"' && cell === '' && !closedQuote) quoted = true
    else if (char === ',') { row.push(cell); cell = ''; closedQuote = false }
    else if (char === '\n' || char === '\r') { if (char === '\r' && value[i + 1] === '\n') i++; row.push(cell); if (row.some((item) => item.trim())) rows.push(row); row = []; cell = ''; closedQuote = false }
    else if (closedQuote && !/\s/.test(char)) throw new Error('Unexpected character after a closing quote.')
    else if (!closedQuote) cell += char
  }
  if (quoted) throw new Error('A quoted field is not closed.')
  if (cell || row.length) { row.push(cell); if (row.some((item) => item.trim())) rows.push(row) }
  if (!rows.length) throw new Error('The file is empty.')
  if (rows.length > 101) throw new Error('Import at most 100 trades per file.')
  if (rows.some((item) => item.length !== rows[0].length)) throw new Error('Each row must have the same number of columns as the header.')
  return rows
}

const aliases: Record<Column, string[]> = {
  date: ['date', 'tradedate', 'entrydate', 'opendate'], exitDate: ['exitdate', 'closedate'], pair: ['pair', 'symbol', 'instrument'], side: ['side', 'direction', 'type'], lots: ['lots', 'lotsize', 'size', 'volume'], entry: ['entry', 'entryprice', 'openprice'], exit: ['exit', 'exitprice', 'closeprice'], entryTime: ['entrytime', 'opentime'], exitTime: ['exittime', 'closetime'], commission: ['commission', 'commissions', 'fees'], swap: ['swap'], setup: ['setup', 'strategy'],
}
export function suggestMapping(headers: string[]): Mapping {
  return Object.fromEntries(columns.map((column) => [column, headers.findIndex((header) => aliases[column].includes(header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')))])) as Mapping
}
export function previewCsv(rows: string[][], mapping: Mapping, existing: TradeInput[]): PreviewRow[] {
  const required: Column[] = ['date', 'pair', 'side', 'lots', 'entry', 'exit', 'entryTime', 'exitTime']
  const missing = required.filter((column) => mapping[column] < 0)
  if (missing.length) throw new Error(`Map required columns: ${missing.join(', ')}.`)
  const used = columns.map((column) => mapping[column]).filter((index) => index >= 0)
  if (new Set(used).size !== used.length) throw new Error('Map each CSV column to only one field.')
  const seen = new Set(existing.map(tradeFingerprint))
  return rows.slice(1).map((row, index) => {
    const get = (name: Column) => mapping[name] < 0 ? '' : (row[mapping[name]] ?? '').trim()
    const rawPair = get('pair').toUpperCase().replace(/[^A-Z]/g, '')
    const pair = rawPair === 'XAUUSDZ' ? 'XAU/USD' : supportedPairs.find((candidate) => candidate.replace('/', '') === rawPair) ?? get('pair') as Pair
    const direction = get('side').toLowerCase()
    const side = direction === 'buy' || direction === 'long' ? 'Long' : direction === 'sell' || direction === 'short' ? 'Short' : get('side') as TradeInput['side']
    const numeric = (name: Column, optional = false) => { const raw = get(name); return raw ? Number(raw) : optional ? 0 : NaN }
    const input: TradeInput = { date: get('date'), ...(get('exitDate') ? { exitDate: get('exitDate') } : {}), pair, side, lots: numeric('lots'), entry: numeric('entry'), exit: numeric('exit'), entryTime: get('entryTime'), exitTime: get('exitTime'), commission: numeric('commission', true), swap: numeric('swap', true), setup: get('setup') }
    const errors = validateTrade(input); const fingerprint = tradeFingerprint(input); const duplicate = !errors.length && seen.has(fingerprint)
    if (!errors.length) seen.add(fingerprint)
    return { line: index + 2, input, errors, duplicate }
  })
}
