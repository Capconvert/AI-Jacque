#!/usr/bin/env node
// One-shot OAuth helper for Google Ads API.
// Usage:
//   GOOGLE_ADS_OAUTH_CLIENT_ID=xxx GOOGLE_ADS_OAUTH_CLIENT_SECRET=yyy node scripts/google-ads-oauth.mjs
// Opens a browser, completes OAuth with adwords scope, prints the refresh_token.

import http from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_ADS_OAUTH_CLIENT_ID and GOOGLE_ADS_OAUTH_CLIENT_SECRET as env vars and re-run.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = http.createServer(async (req, res) => {
  if (!req.url) return;
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname !== '/callback') {
    res.writeHead(404).end('Not found');
    return;
  }
  const code = u.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('No code');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok || !json.refresh_token) {
      console.error('Token exchange failed:', json);
      res.writeHead(500).end('Token exchange failed - check terminal');
      server.close();
      process.exit(1);
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(`
      <html><body style="font-family: system-ui; padding: 40px; max-width: 600px;">
      <h1>Done</h1>
      <p>Refresh token captured. You can close this window and check the terminal.</p>
      </body></html>
    `);
    console.log('\n=== REFRESH TOKEN ===');
    console.log(json.refresh_token);
    console.log('\nAdd to Vercel:');
    console.log(`  printf '${json.refresh_token}' | vercel env add GOOGLE_ADS_REFRESH_TOKEN production`);
    console.log(`  printf '${json.refresh_token}' | vercel env add GOOGLE_ADS_REFRESH_TOKEN preview`);
    server.close();
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500).end('Error - check terminal');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
  console.log('Opening browser for Google sign-in...');
  console.log('Sign in with the account that has access to your Google Ads MCC.\n');
  exec(`open "${authUrl.toString()}"`);
});
