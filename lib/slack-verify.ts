import crypto from 'node:crypto';

export function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  if (!timestamp || !signature || !signingSecret) return false;

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Number.isNaN(age) || Math.abs(age) > 60 * 5) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const myHash = `v0=${crypto.createHmac('sha256', signingSecret).update(sigBase).digest('hex')}`;

  const a = Buffer.from(myHash);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
