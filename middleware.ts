import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Which role is allowed on which route prefix
const ROLE_ROUTE_MAP: Record<string, string> = {
    '/admin': 'admin',
    '/doctor': 'doctor',
    '/nurse': 'nurse',
    '/pharmacist': 'pharmacist',
    '/cashier': 'cashier',
    '/lab': 'lab_nurse',
    '/nutritionist': 'nutritionist',
}

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            cookies: {
                getAll() { return request.cookies.getAll() },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Always refresh session first
    const { data: { user } } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname

    // ── Not logged in ──────────────────────────────────────────────────────
    // If trying to access any protected route, kick to login
    const isProtectedRoute = Object.keys(ROLE_ROUTE_MAP).some(
        prefix => pathname.startsWith(prefix)
    )

    if (!user && isProtectedRoute) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    // ── Already logged in ──────────────────────────────────────────────────
    if (user) {
        // Fetch their role once (cached by the cookie — fast)
        const { data: practitioner } = await supabase
            .from('practitioners')
            .select('role')
            .eq('user_id', user.id)
            .single()

        const userRole = practitioner?.role

        // If on login page, redirect to their own dashboard
        if (pathname === '/') {
            const ownRoute = Object.entries(ROLE_ROUTE_MAP).find(
                ([, role]) => role === userRole
            )?.[0] ?? '/admin'
            return NextResponse.redirect(new URL(ownRoute, request.url))
        }

        // If on a protected route, check they own that role
        const requiredRole = Object.entries(ROLE_ROUTE_MAP).find(
            ([prefix]) => pathname.startsWith(prefix)
        )?.[1]

        if (requiredRole && userRole !== requiredRole) {
            // Wrong role — redirect to their own dashboard instead of 403
            const ownRoute = Object.entries(ROLE_ROUTE_MAP).find(
                ([, role]) => role === userRole
            )?.[0] ?? '/admin'
            return NextResponse.redirect(new URL(ownRoute, request.url))
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/).*)',
    ],
}