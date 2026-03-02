export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Supaboard MCP Server</h1>
      <p>This is a Model Context Protocol (MCP) server for Supaboard retail analytics.</p>
      <h2>Available Tools</h2>
      <ul>
        <li><strong>run_query</strong> - Execute read-only SQL queries</li>
        <li><strong>list_tables</strong> - List all tables in the database</li>
        <li><strong>describe_table</strong> - Get schema for a table</li>
        <li><strong>quick_stats</strong> - Get summary statistics</li>
      </ul>
      <h2>Connect</h2>
      <p>Add this URL as a custom connector in Claude:</p>
      <code style={{ background: '#f0f0f0', padding: '0.5rem', display: 'block' }}>
        https://your-deployment.vercel.app/mcp
      </code>
    </main>
  )
}
