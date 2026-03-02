import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export async function GET() {
  const headersList = await headers()
  const host = headersList.get('host') || 'supaboard-mcp.vercel.app'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`

  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['read:data', 'claudeai'],
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
