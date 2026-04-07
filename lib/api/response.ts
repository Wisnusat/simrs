import { NextResponse } from 'next/server'

export interface ApiMeta {
    total?: number
    page?: number
    limit?: number
    [key: string]: unknown
}

export interface ApiSuccess<T = unknown> {
    success: true
    data: T
    meta?: ApiMeta
}

export interface ApiError {
    success: false
    error: string
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ---------------------------------------------------------------------------
// Response factory
// ---------------------------------------------------------------------------

function ok<T>(data: T, meta?: ApiMeta, status = 200): NextResponse<ApiSuccess<T>> {
    const body: ApiSuccess<T> = { success: true, data }
    if (meta) body.meta = meta
    return NextResponse.json(body, { status })
}

function created<T>(data: T): NextResponse<ApiSuccess<T>> {
    return ok(data, undefined, 201)
}

function error(message: string, status: number): NextResponse<ApiError> {
    return NextResponse.json({ success: false, error: message }, { status })
}

// Convenience aliases for common HTTP errors
const unauthorized = () => error('Unauthorized', 401)
const forbidden = (msg = 'Forbidden') => error(msg, 403)
const notFound = (msg = 'Not found') => error(msg, 404)
const conflict = (msg: string) => error(msg, 409)
const badRequest = (msg: string) => error(msg, 400)
const tooManyRequests = (retryAfter: number) =>
    NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
        }
    )
const serverError = (msg = 'Internal server error') => error(msg, 500)

export const apiResponse = {
    ok,
    created,
    error,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    badRequest,
    tooManyRequests,
    serverError,
}
