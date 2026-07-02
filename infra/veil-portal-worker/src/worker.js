/** Portal worker: serve veil + join-veil; redirect older hostnames to canonical portal. */
const UPSTREAM = 'https://veil-81c.pages.dev';
const CANONICAL = 'https://veil.goldspireventures.com';

const REDIRECT_TO_CANONICAL = new Set([
  'join-veil.goldspireventures.com',
  'join-secure-text.goldspireventures.com',
]);

function upstreamPath(pathname) {
  if (pathname === '/' || pathname === '' || pathname === '/index.html') return '/';
  if (pathname === '/practice' || pathname === '/practice.html') return '/practice/';
  if (!pathname.endsWith('.html')) return pathname;
  const base = pathname.slice(1, -5);
  if (!base || base === 'index') return '/';
  return `/${base}`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (REDIRECT_TO_CANONICAL.has(url.hostname)) {
      const target = new URL(url.pathname + url.search, CANONICAL);
      return Response.redirect(target.toString(), 301);
    }
    if (url.pathname === '/ops.html' || url.pathname === '/portal/ops.js') {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }
    const target = new URL(upstreamPath(url.pathname) + url.search, UPSTREAM);
    const init = {
      method: request.method,
      headers: new Headers(request.headers),
      redirect: 'follow',
    };
    init.headers.set('Host', 'veil-81c.pages.dev');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }
    const response = await fetch(target.toString(), init);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
