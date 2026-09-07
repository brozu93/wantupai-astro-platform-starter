/** Shared response helpers so every endpoint answers in the same shape. */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
    });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
    return json({ ok: false, error: message, ...extra }, status);
}

/** Reads a JSON body, refusing anything oversized before it is parsed. */
export async function readJson(request: Request, maxBytes = 256 * 1024): Promise<unknown> {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > maxBytes) throw new Error('Permintaan terlalu besar.');
    const text = await request.text();
    if (text.length > maxBytes) throw new Error('Permintaan terlalu besar.');
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new Error('Badan permintaan bukan JSON yang sah.');
    }
}

/**
 * Headers that make a browser save the response as a file.
 *
 * `cache` is for responses that are identical for everyone - the free sample is the only one.
 * Anything generated from a customer's own text stays uncached.
 */
export function attachment(filename: string, type: string, length: number, cache?: { cdnMaxAgeSeconds: number }): Record<string, string> {
    // Keep the ASCII fallback simple and give the real name via the UTF-8 form.
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    const headers: Record<string, string> = {
        'Content-Type': type,
        'Content-Length': String(length),
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store'
    };

    if (cache) {
        headers['Cache-Control'] = `public, max-age=${cache.cdnMaxAgeSeconds}`;
        headers['Netlify-CDN-Cache-Control'] = `public, max-age=${cache.cdnMaxAgeSeconds}, must-revalidate`;
    }
    return headers;
}

/** The site's own origin, used to build absolute URLs for payment redirects. */
export function originOf(request: Request): string {
    const configured = process.env.URL ?? process.env.DEPLOY_PRIME_URL;
    if (configured) return configured.replace(/\/$/, '');
    return new URL(request.url).origin;
}

/**
 * Hands a byte array to `Response` as a body.
 *
 * A typed array is generic over its backing buffer, which `BodyInit` will not accept, so the
 * exact bytes are handed over instead - without copying when the view already spans the whole
 * buffer, which is the case for everything the generator produces.
 */
export function toBody(bytes: Uint8Array): ArrayBuffer {
    if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer as ArrayBuffer;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
