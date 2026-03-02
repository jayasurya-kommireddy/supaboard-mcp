import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Simple in-memory store for auth codes (in production, use Redis or similar)
// For Vercel serverless, we'll encode everything in the code itself
function generateAuthCode(clientId: string, codeChallenge: string, redirectUri: string): string {
  const data = JSON.stringify({
    clientId,
    codeChallenge,
    redirectUri,
    exp: Date.now() + 60000, // 1 minute expiry
  })
  return Buffer.from(data).toString('base64url')
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const responseType = url.searchParams.get('response_type')
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')
  const codeChallenge = url.searchParams.get('code_challenge')
  const codeChallengeMethod = url.searchParams.get('code_challenge_method')
  const state = url.searchParams.get('state')
  const scope = url.searchParams.get('scope')

  // Validate required params
  if (responseType !== 'code') {
    return NextResponse.json({ error: 'unsupported_response_type' }, { status: 400 })
  }

  if (!clientId || !redirectUri || !codeChallenge || !state) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Missing required parameters' }, { status: 400 })
  }

  // Validate client_id
  const expectedClientId = process.env.OAUTH_CLIENT_ID
  if (clientId !== expectedClientId) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 401 })
  }

  // For team access, auto-approve without login UI
  // Generate auth code
  const code = generateAuthCode(clientId, codeChallenge, redirectUri)

  // Redirect back to Claude with the code
  const redirectUrl = new URL(redirectUri)
  redirectUrl.searchParams.set('code', code)
  redirectUrl.searchParams.set('state', state)

  return NextResponse.redirect(redirectUrl.toString())
}
