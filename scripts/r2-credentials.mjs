import { createHash } from 'node:crypto';
import { cloudflare } from './cloudflare-api.mjs';

// Cloudflare documents S3 credentials as the token ID and SHA-256 of its value:
// https://developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token
// Explicit bucket-scoped credentials can override this without token discovery.
export async function r2Credentials(env = process.env, verify = () => cloudflare('/user/tokens/verify')) {
  const access = env.AWS_ACCESS_KEY_ID, secret = env.AWS_SECRET_ACCESS_KEY;
  if (access && secret) return { AWS_ACCESS_KEY_ID: access, AWS_SECRET_ACCESS_KEY: secret };
  if (access || secret || env.AWS_SESSION_TOKEN) throw new Error('Provide both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or leave both unset to use the Cloudflare token.');
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('Set CLOUDFLARE_API_TOKEN to authenticate the R2 state backend.');
  const token = await verify();
  if (token?.status !== 'active' || !/^[a-f0-9]{32}$/.test(token?.id ?? '')) throw new Error('Could not verify an active Cloudflare token for R2.');
  return {
    AWS_ACCESS_KEY_ID: token.id,
    AWS_SECRET_ACCESS_KEY: createHash('sha256').update(env.CLOUDFLARE_API_TOKEN).digest('hex'),
  };
}
