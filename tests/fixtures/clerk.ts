import { createSign, generateKeyPairSync } from 'node:crypto';

export const testClerkKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function mintClerkToken(options: {
  sub: string;
  username?: string;
  azp?: string;
  expOffsetSeconds?: number;
  privateKey?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'RS256', typ: 'JWT', kid: 'ins_test_clerk' });
  const payload = base64url({
    sub: options.sub,
    ...(options.username ? { username: options.username } : {}),
    ...(options.azp ? { azp: options.azp } : {}),
    iss: 'https://test.clerk.accounts.dev',
    sid: `sess_${options.sub}`,
    iat: now - 5,
    nbf: now - 5,
    exp: now + (options.expOffsetSeconds ?? 3600),
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(options.privateKey ?? testClerkKeys.privateKey, 'base64url');
  return `${header}.${payload}.${signature}`;
}
