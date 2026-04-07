import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, password } = body

        // Validate input
        if (!email || !password) {
            return NextResponse.json(
                { success: false, error: 'Email and password are required' },
                { status: 400 }
            )
        }

        const supabase = await createClient()

        // Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (authError || !authData.user) {
            return NextResponse.json(
                { success: false, error: 'Invalid email or password' },
                { status: 401 }
            )
        }

        // Fetch practitioner profile + organization
        const { data: practitioner, error: profileError } = await supabase
            .from('practitioners')
            .select(`
        id,
        full_name,
        role,
        specialization,
        email,
        organization_id,
        organizations (
          id,
          name,
          type
        )
      `)
            .eq('user_id', authData.user.id)
            .eq('is_active', true)
            .single()

        if (profileError || !practitioner) {
            // Auth succeeded but no practitioner profile — sign out and reject
            await supabase.auth.signOut()
            return NextResponse.json(
                { success: false, error: 'Staff profile not found. Contact administrator.' },
                { status: 403 }
            )
        }

        return NextResponse.json({
            success: true,
            data: {
                user: {
                    id: authData.user.id,
                    email: authData.user.email,
                },
                profile: {
                    id: practitioner.id,
                    full_name: practitioner.full_name,
                    role: practitioner.role,
                    specialization: practitioner.specialization,
                    organization_id: practitioner.organization_id,
                    organization: practitioner.organizations,
                },
            },
        })
    } catch {
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}