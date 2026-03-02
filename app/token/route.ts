import { NextResponse } from 'next/server'
import crypto from 'crypto'

// Verify PKCE code_verifier against code_challenge
function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest()
  const computed = hash.toString('base64url')
  return computed === codeChallenge
}

// Decode auth code
function decodeAuthCode(code: string): { clientId: string; codeChallenge: string; redirectUri: string; exp: number } | null {
  try {
    const data = Buffer.from(code, 'base64url').toString()
    return JSON.parse(data)
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || ''

  let clientId: string | null = null
  let clientSecret: string | null = null
  let grantType: string | null = null
  let code: string | null = null
  let codeVerifier: string | null = null
  let redirectUri: string | null = null

  // Parse credentials from form data or JSON
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    clientId = formData.get('client_id') as string
    clientSecret = formData.get('client_secret') as string
    grantType = formData.get('grant_type') as string
    code = formData.get('code') as string
    codeVerifier = formData.get('code_verifier') as string
    redirectUri = formData.get('redirect_uri') as string
  } else if (contentType.includes('application/json')) {
    const body = await request.json()
    clientId = body.client_id
    clientSecret = body.client_secret
    grantType = body.grant_type
    code = body.code
    codeVerifier = body.code_verifier
    redirectUri = body.redirect_uri
  }

  const expectedClientId = process.env.OAUTH_CLIENT_ID
  const expectedClientSecret = process.env.OAUTH_CLIENT_SECRET
  const accessToken = process.env.MCP_SECRET_TOKEN

  if (!expectedClientId || !expectedClientSecret || !accessToken) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'OAuth not configured' },
      { status: 500 }
    )
  }

  // Handle authorization_code grant (PKCE)
  if (grantType === 'authorization_code') {
    if (!code || !codeVerifier || !redirectUri) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing code, code_verifier, or redirect_uri' },
        { status: 400 }
      )
    }

    // Decode and validate auth code
    const codeData = decodeAuthCode(code)
    if (!codeData) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Invalid authorization code' },
        { status: 400 }
      )
    }

    // Check expiry
    if (Date.now() > codeData.exp) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Authorization code expired' },
        { status: 400 }
      )
    }

    // Validate client_id matches
    if (clientId !== codeData.clientId || clientId !== expectedClientId) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Client ID mismatch' },
        { status: 401 }
      )
    }

    // Validate redirect_uri matches
    if (redirectUri !== codeData.redirectUri) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
        { status: 400 }
      )
    }

    // Verify PKCE
    if (!verifyPKCE(codeVerifier, codeData.codeChallenge)) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'PKCE verification failed' },
        { status: 400 }
      )
    }

    // Return access token
    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 86400,
      scope: 'read:data',
    })
  }

  // Handle client_credentials grant
  if (grantType === 'client_credentials') {
    if (clientId !== expectedClientId || clientSecret !== expectedClientSecret) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 86400,
      scope: 'read:data',
    })
  }

  return NextResponse.json(
    { error: 'unsupported_grant_type', error_description: 'Only authorization_code and client_credentials grants are supported' },
    { status: 400 }
  )
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
