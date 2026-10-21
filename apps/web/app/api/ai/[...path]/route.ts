import type { NextRequest } from 'next/server';

// Proxy to the FastAPI model server: /api/ai/v1/estimate → $MODEL_SERVER_URL/v1/estimate.
// Keeps the Cloudflare Tunnel URL out of the browser and avoids CORS setup.

const TIMEOUT_MS = 30_000;
// No leading dot, so "." and ".." are rejected too.
const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

async function proxy(request: NextRequest, ctx: RouteContext<'/api/ai/[...path]'>) {
  const base = process.env.MODEL_SERVER_URL;
  if (!base) return Response.json({ detail: 'Model server is not configured' }, { status: 503 });

  // Only versioned API paths are forwarded; nothing like /docs or ../ reaches the server.
  const { path } = await ctx.params;
  if (path[0] !== 'v1' || !path.every((segment) => SAFE_SEGMENT.test(segment))) {
    return Response.json({ detail: 'Not found' }, { status: 404 });
  }
  const target = new URL(path.join('/') + request.nextUrl.search, base.endsWith('/') ? base : `${base}/`);

  const headers = new Headers({ accept: 'application/json' });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      // Buffered so JSON and multipart uploads (portfolio photos) both pass through unchanged.
      body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return Response.json(
      { detail: timedOut ? 'Model server timed out' : 'Model server is unreachable' },
      { status: timedOut ? 504 : 502 },
    );
  }
}

export { proxy as GET, proxy as POST };
