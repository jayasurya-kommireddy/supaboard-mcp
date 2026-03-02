import { createClient } from '@clickhouse/client-web'

export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DATABASE || 'retail',
})

interface ClickHouseResult {
  meta: { name: string }[]
  data: unknown[][]
}

export async function runQuery(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  // Security: only allow SELECT queries
  const normalized = sql.trim().toUpperCase()
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('SHOW') && !normalized.startsWith('DESCRIBE')) {
    throw new Error('Only SELECT, SHOW, and DESCRIBE queries are allowed')
  }

  const result = await clickhouse.query({
    query: sql,
    format: 'JSONCompact',
  })

  const data = (await result.json()) as ClickHouseResult

  return {
    columns: data.meta?.map((m) => m.name) ?? [],
    rows: data.data ?? [],
  }
}

export async function listTables(): Promise<string[]> {
  const result = await clickhouse.query({
    query: `SHOW TABLES FROM ${process.env.CLICKHOUSE_DATABASE || 'retail'}`,
    format: 'JSONCompact',
  })
  const data = (await result.json()) as { data: string[][] }
  return data.data?.map((row) => row[0]) ?? []
}

export async function describeTable(table: string): Promise<{ column: string; type: string }[]> {
  // Sanitize table name
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '')

  const result = await clickhouse.query({
    query: `DESCRIBE TABLE ${process.env.CLICKHOUSE_DATABASE || 'retail'}.${safeTable}`,
    format: 'JSONCompact',
  })
  const data = (await result.json()) as { data: string[][] }
  return data.data?.map((row) => ({ column: row[0], type: row[1] })) ?? []
}
