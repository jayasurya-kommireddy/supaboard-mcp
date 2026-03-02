import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || ''

  let clientId: string | null = null
  let clientSecret: string | null = null
  let grantType: string | null = null

  // Parse credentials from form data or JSON
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    clientId = formData.get('client_id') as string
    clientSecret = formData.get('client_secret') as string
    grantType = formData.get('grant_type') as string
  } else if (contentType.includes('application/json')) {
    const body = await request.json()
    clientId = body.client_id
    clientSecret = body.client_secret
    grantType = body.grant_type
  }

  // Validate grant type
  if (grantType !== 'client_credentials') {
    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: 'Only client_credentials grant is supported' },
      { status: 400 }
    )
  }

  // Validate credentials
  const expectedClientId = process.env.OAUTH_CLIENT_ID
  const expectedClientSecret = process.env.OAUTH_CLIENT_SECRET
  const accessToken = process.env.MCP_SECRET_TOKEN

  if (!expectedClientId || !expectedClientSecret || !accessToken) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'OAuth not configured' },
      { status: 500 }
    )
  }

  if (clientId !== expectedClientId || clientSecret !== expectedClientSecret) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Invalid client credentials' },
      { status: 401 }
    )
  }

  // Return access token
  return NextResponse.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 86400, // 24 hours
    scope: 'read:data',
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
