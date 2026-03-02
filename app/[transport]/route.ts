import { createMcpHandler, withMcpAuth } from 'mcp-handler'

interface AuthInfo {
  token: string
  scopes: string[]
  clientId: string
  extra?: Record<string, unknown>
}
import { z } from 'zod'
import { runQuery, listTables, describeTable } from '@/lib/clickhouse'

// Token verification - checks Bearer token against env var
const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined

  const expectedToken = process.env.MCP_SECRET_TOKEN
  if (!expectedToken) {
    console.error('MCP_SECRET_TOKEN not configured')
    return undefined
  }

  if (bearerToken !== expectedToken) {
    return undefined
  }

  return {
    token: bearerToken,
    scopes: ['read:data', 'claudeai'],
    clientId: 'supaboard-team',
  }
}

const handler = createMcpHandler(
  (server) => {
    // Tool 1: Run SQL query (read-only)
    server.registerTool(
      'run_query',
      {
        title: 'Run Query',
        description:
          'Execute a read-only SQL query against the ClickHouse retail database. Only SELECT, SHOW, and DESCRIBE queries are allowed.',
        inputSchema: {
          sql: z.string().describe('The SQL query to execute. Must be a SELECT, SHOW, or DESCRIBE query.'),
        },
      },
      async ({ sql }) => {
        try {
          const result = await runQuery(sql)

          if (result.rows.length === 0) {
            return {
              content: [{ type: 'text', text: 'Query returned no results.' }],
            }
          }

          // Limit output to 100 rows
          const limitedRows = result.rows.slice(0, 100)
          const truncated = result.rows.length > 100

          // Build markdown table
          const header = `| ${result.columns.join(' | ')} |`
          const separator = `| ${result.columns.map(() => '---').join(' | ')} |`
          const rows = limitedRows.map((row) => `| ${row.map((v) => String(v ?? 'NULL')).join(' | ')} |`)

          let output = [header, separator, ...rows].join('\n')
          if (truncated) {
            output += `\n\n_Showing 100 of ${result.rows.length} rows_`
          }

          return {
            content: [{ type: 'text', text: output }],
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true,
          }
        }
      }
    )

    // Tool 2: List tables
    server.registerTool(
      'list_tables',
      {
        title: 'List Tables',
        description: 'List all tables in the retail database',
        inputSchema: {},
      },
      async () => {
        try {
          const tables = await listTables()
          return {
            content: [{ type: 'text', text: `Tables in retail database:\n${tables.map((t) => `- ${t}`).join('\n')}` }],
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true,
          }
        }
      }
    )

    // Tool 3: Describe table
    server.registerTool(
      'describe_table',
      {
        title: 'Describe Table',
        description: 'Get the schema (columns and types) for a specific table',
        inputSchema: {
          table: z.string().describe('The table name to describe'),
        },
      },
      async ({ table }) => {
        try {
          const schema = await describeTable(table)
          const output = schema.map((col) => `- ${col.column}: ${col.type}`).join('\n')
          return {
            content: [{ type: 'text', text: `Schema for ${table}:\n${output}` }],
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true,
          }
        }
      }
    )

    // Tool 4: Quick stats
    server.registerTool(
      'quick_stats',
      {
        title: 'Quick Stats',
        description: 'Get quick summary statistics for the retail database (date range, total sales, etc.)',
        inputSchema: {},
      },
      async () => {
        try {
          const result = await runQuery(`
            SELECT
              min(trading_date) as earliest_date,
              max(trading_date) as latest_date,
              count() as total_transactions,
              sum(sales_total_ex) as total_sales,
              count(DISTINCT store_code) as num_stores
            FROM retail.fact_baskets
          `)

          const row = result.rows[0] as [string, string, number, number, number]
          const output = `
Retail Database Summary:
- Date range: ${row[0]} to ${row[1]}
- Total transactions: ${Number(row[2]).toLocaleString()}
- Total sales: $${Number(row[3]).toLocaleString()}
- Number of stores: ${row[4]}
          `.trim()

          return {
            content: [{ type: 'text', text: output }],
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true,
          }
        }
      }
    )
  },
  {},
  {
    basePath: '',
    maxDuration: 60,
    verboseLogs: true,
  }
)

// Wrap with auth - requires valid Bearer token
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
})

export { authHandler as GET, authHandler as POST }
