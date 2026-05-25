import { useState, useEffect } from 'react'

export interface Vendor {
    id: string
    name: string
    contact_person: string | null
    phone: string | null
    email: string | null
}

export function useVendors() {
    const [data, setData] = useState<Vendor[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/pharmacist/vendors')
            .then(r => r.json())
            .then(json => { if (json.success) setData(json.data ?? []) })
            .catch(() => {/* silent */})
            .finally(() => setLoading(false))
    }, [])

    return { data, loading }
}
