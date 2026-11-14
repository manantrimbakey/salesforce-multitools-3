/**
 * Minimal method + path-pattern router used for the webview <-> extension host RPC.
 * It mirrors the small subset of Express semantics the webview API relied on.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RpcErrorCode = 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_ERROR';

/** Error whose message is safe to show to the webview (validation / expected failures). */
export class RpcError extends Error {
    constructor(
        public readonly code: RpcErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'RpcError';
    }
}

export interface RpcRequest {
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
}

export type RpcHandler = (request: RpcRequest) => Promise<unknown> | unknown;

interface Route {
    method: HttpMethod;
    segments: string[];
    handler: RpcHandler;
}

export type ParamValidators = Record<string, (value: string) => boolean>;

const METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export class Router {
    private readonly routes: Route[] = [];

    /**
     * @param paramValidators Validators keyed by path parameter name; a failing value is rejected
     *                        with a BAD_REQUEST before the handler runs.
     */
    constructor(private readonly paramValidators: ParamValidators = {}) {}

    public add(method: HttpMethod, pattern: string, handler: RpcHandler): this {
        this.routes.push({ method, segments: splitPath(pattern), handler });
        return this;
    }

    public get(pattern: string, handler: RpcHandler): this {
        return this.add('GET', pattern, handler);
    }

    public post(pattern: string, handler: RpcHandler): this {
        return this.add('POST', pattern, handler);
    }

    public delete(pattern: string, handler: RpcHandler): this {
        return this.add('DELETE', pattern, handler);
    }

    /** Resolve the endpoint (path + optional query string) and run the matching handler. */
    public async dispatch(method: string, endpoint: string, body: unknown): Promise<unknown> {
        const normalizedMethod = method.toUpperCase();
        if (!METHODS.includes(normalizedMethod)) {
            throw new RpcError('BAD_REQUEST', 'Unsupported method');
        }

        const url = new URL(endpoint, 'http://rpc.invalid');
        const pathSegments = splitPath(url.pathname);

        for (const route of this.routes) {
            if (route.method !== normalizedMethod) {
                continue;
            }
            const params = matchSegments(route.segments, pathSegments);
            if (!params) {
                continue;
            }
            this.validateParams(params);
            return route.handler({ params, query: Object.fromEntries(url.searchParams), body });
        }

        throw new RpcError('NOT_FOUND', 'Unknown endpoint');
    }

    private validateParams(params: Record<string, string>): void {
        for (const [name, value] of Object.entries(params)) {
            const validator = this.paramValidators[name];
            if (validator && !validator(value)) {
                throw new RpcError('BAD_REQUEST', `Invalid ${name}`);
            }
        }
    }
}

function splitPath(path: string): string[] {
    return path.split('/').filter((segment) => segment.length > 0);
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | undefined {
    if (pattern.length !== actual.length) {
        return undefined;
    }
    const params: Record<string, string> = {};
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i].startsWith(':')) {
            try {
                params[pattern[i].slice(1)] = decodeURIComponent(actual[i]);
            } catch {
                throw new RpcError('BAD_REQUEST', 'Malformed path');
            }
        } else if (pattern[i] !== actual[i]) {
            return undefined;
        }
    }
    return params;
}

/** Narrow an RPC body to a plain object (missing body becomes `{}`). */
export function bodyObject(body: unknown): Record<string, unknown> {
    if (body === null || body === undefined) {
        return {};
    }
    if (typeof body !== 'object' || Array.isArray(body)) {
        throw new RpcError('BAD_REQUEST', 'Request body must be an object');
    }
    return body as Record<string, unknown>;
}
