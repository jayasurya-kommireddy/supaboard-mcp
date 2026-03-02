import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { runQuery, listTables, describeTable } from '@/lib/clickhouse'

// Pre-loaded schema to avoid repeated lookups
const DATABASE_SCHEMA = `
## Supaboard Retail Database Schema

### Main Tables

**fact_baskets** - Transaction-level sales data
- trading_date (Date) - The date of the transaction
- store_code (String) - Store identifier (3631, 3632, 3633, 3634, 3635, 90)
- basket_id (String) - Unique basket/transaction ID
- sales_total_ex (Float64) - Total sales excluding GST
- sales_total_inc (Float64) - Total sales including GST
- item_count (UInt32) - Number of items in basket
- transaction_datetime (DateTime) - Full timestamp

**fact_line_items** - Item-level sales data
- trading_date (Date)
- store_code (String)
- basket_id (String)
- item_code (String) - SKU/product code
- item_description (String)
- quantity (Float64)
- sales_ex (Float64) - Line item sales ex GST
- cost_ex (Float64) - Line item cost ex GST

**item_attrs** - Product attributes
- item_code (String)
- department_name (String)
- category_name (String)
- commodity_name (String)

**brochure_specials** - Promotional items
- item_code (String)
- promo_sell (Float64)
- window_start (Date)
- window_end (Date)

### Store Codes
- 3631: Supabarn Wanniassa
- 3632: Supabarn Kaleen
- 3633: Supabarn Crace
- 3634: Supabarn Casey
- 3635: Supabarn Kingston
- 90: Supabarn Annandale
`

const INSTRUCTIONS = `
## Instructions for Supaboard Queries

1. **Don't look up schema** - Use the schema provided above. Go straight to querying.

2. **No artifacts** - Return results as simple markdown tables in your response. Don't create artifacts/canvases.

3. **Be concise** - Show the data, add a brief insight if relevant. No lengthy explanations.

4. **Date handling** - Use ClickHouse date functions:
   - today() - current date
   - today() - 7 for last week
   - toStartOfWeek(trading_date) for weekly grouping

5. **Common queries**:
   - Sales by store: GROUP BY store_code
   - Daily trends: GROUP BY trading_date
   - Top products: ORDER BY sales_ex DESC LIMIT 10
`

const mcpHandler = createMcpHandler(
  (server) => {
    // Register a prompt with schema and instructions
    server.registerPrompt(
      'supaboard_context',
      {
        title: 'Supaboard Database Context',
        description: 'Schema and instructions for querying the Supaboard retail database',
      },
      async () => {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: DATABASE_SCHEMA + '\n' + INSTRUCTIONS,
              },
            },
          ],
        }
      }
    )

    // Tool 1: Run SQL query (read-only)
    server.registerTool(
      'run_query',
      {
        title: 'Run Query',
        description: 'Execute a SQL query. Schema: fact_baskets (trading_date, store_code, sales_total_ex, item_count), fact_line_items (item_code, quantity, sales_ex), item_attrs (department_name, category_name). Stores: 3631-3635, 90.',
        inputSchema: {
          sql: z.string().describe('SQL query (SELECT only)'),
        },
      },
      async ({ sql }) => {
        try {
          const result = await runQuery(sql)

          if (result.rows.length === 0) {
            return { content: [{ type: 'text', text: 'No results.' }] }
          }

          const limitedRows = result.rows.slice(0, 100)
          const truncated = result.rows.length > 100

          const header = `| ${result.columns.join(' | ')} |`
          const separator = `| ${result.columns.map(() => '---').join(' | ')} |`
          const rows = limitedRows.map((row) => `| ${row.map((v) => String(v ?? 'NULL')).join(' | ')} |`)

          let output = [header, separator, ...rows].join('\n')
          if (truncated) {
            output += `\n\n_Showing 100 of ${result.rows.length} rows_`
          }

          return { content: [{ type: 'text', text: output }] }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true,
          }
        }
      }
    )

    // Tool 2: List tables (kept for edge cases)
    server.registerTool(
      'list_tables',
      {
        title: 'List Tables',
        description: 'List tables (usually not needed - schema is pre-loaded)',
        inputSchema: {},
      },
      async () => {
        try {
          const tables = await listTables()
          return { content: [{ type: 'text', text: tables.join(', ') }] }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true,
          }
        }
      }
    )

    // Tool 3: Describe table (kept for edge cases)
    server.registerTool(
      'describe_table',
      {
        title: 'Describe Table',
        description: 'Get table schema (usually not needed - schema is pre-loaded)',
        inputSchema: {
          table: z.string().describe('Table name'),
        },
      },
      async ({ table }) => {
        try {
          const schema = await describeTable(table)
          return { content: [{ type: 'text', text: schema.map((c) => `${c.column}: ${c.type}`).join(', ') }] }
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
        description: 'Database summary (date range, total sales, store count)',
        inputSchema: {},
      },
      async () => {
        try {
          const result = await runQuery(`
            SELECT
              min(trading_date), max(trading_date),
              count(), sum(sales_total_ex),
              count(DISTINCT store_code)
            FROM retail.fact_baskets
          `)
          const [minDate, maxDate, txns, sales, stores] = result.rows[0] as [string, string, number, number, number]
          return {
            content: [{
              type: 'text',
              text: `Data: ${minDate} to ${maxDate} | ${Number(txns).toLocaleString()} transactions | $${Number(sales).toLocaleString()} sales | ${stores} stores`
            }]
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

// Auth check
function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  return authHeader.slice(7) === process.env.MCP_SECRET_TOKEN
}

// Handler with auth
async function handler(request: Request) {
  if (request.method === 'POST' && !checkAuth(request)) {
    return new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return mcpHandler(request)
}

export { handler as GET, handler as POST }
