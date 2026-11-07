export type Side = 'Long' | 'Short'

export type Execution = {
  date?: string
  time: string
  action: 'Buy' | 'Sell'
  price: number
  lots: number
}

export type Trade = {
  brokerSymbol?: string
  source?: 'sample' | 'real'
  historicalAligned?: boolean
  id: string
  date: string
  exitDate?: string
  pair: 'EUR/USD' | 'GBP/USD' | 'AUD/USD' | 'XAU/USD'
  side: Side
  lots: number
  entry: number
  exit: number
  entryTime: string
  exitTime: string
  commission: number
  swap: number
  setup: string
  tags: string[]
  note: string
  executions: Execution[]
}

export type TradeWithPnl = Trade & {
  pips: number
  grossPnl: number
  netPnl: number
}
