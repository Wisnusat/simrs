'use client'

import { useState } from 'react'
import DashboardLayout from '@/components/system/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Package, PackageOpen, Pill, Plus, ShoppingCart } from 'lucide-react'
import { PoList } from '@/components/pharmacist/po/po-list'
import { PoDetailDialog } from '@/components/pharmacist/po/po-detail-dialog'
import { CreatePoDialog } from '@/components/pharmacist/po/create-po-dialog'
import { usePurchaseOrders, type PurchaseOrder } from '@/hooks/pharmacist/use-purchase-orders'
import { useMedications } from '@/hooks/outpatient/use-medications'

const SIDEBAR = [
    { icon: LayoutDashboard, label: 'Dashboard',       href: '/pharmacist' },
    { icon: Pill,            label: 'Resep Obat',      href: '/pharmacist' },
    { icon: Package,         label: 'Stok Obat',       href: '/pharmacist' },
    { icon: PackageOpen,     label: 'Riwayat',         href: '/pharmacist' },
    { icon: ShoppingCart,    label: 'Purchase Order',  href: '/pharmacist/po', active: true },
]

export default function PurchaseOrderPage() {
    const [statusFilter, setStatusFilter]   = useState('')
    const [selectedPo, setSelectedPo]       = useState<PurchaseOrder | null>(null)
    const [initialMode, setInitialMode]     = useState<'detail' | 'receive'>('detail')
    const [showCreate, setShowCreate]       = useState(false)

    const { data: orders, loading, actionLoading, sendPo, receiveItems, createPo } =
        usePurchaseOrders(statusFilter)

    // Medication list for the create form
    const { data: medications } = useMedications()

    const handleView = (po: PurchaseOrder) => {
        setInitialMode('detail')
        setSelectedPo(po)
    }

    const handleReceive = (po: PurchaseOrder) => {
        setInitialMode('receive')
        setSelectedPo(po)
    }

    return (
        <DashboardLayout title="Apoteker — Purchase Order" role="pharmacist" sidebarItems={SIDEBAR}>
            <div className="space-y-6">
                {/* Page header */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <ShoppingCart className="w-6 h-6 text-primary" />
                            Purchase Order
                        </h1>
                        <p className="text-foreground/60 text-sm mt-1">
                            Buat dan kelola pembelian obat dari vendor
                        </p>
                    </div>
                    <Button onClick={() => setShowCreate(true)} className="gap-2">
                        <Plus className="w-4 h-4" /> Buat PO Baru
                    </Button>
                </div>

                {/* List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Daftar Purchase Order ({orders.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PoList
                            orders={orders}
                            loading={loading}
                            statusFilter={statusFilter}
                            onFilterChange={setStatusFilter}
                            onView={handleView}
                            onSend={po => sendPo(po.id)}
                            onReceive={handleReceive}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Dialogs */}
            {selectedPo && (
                <PoDetailDialog
                    po={selectedPo}
                    initialMode={initialMode}
                    actionLoading={actionLoading}
                    onClose={() => setSelectedPo(null)}
                    onReceive={receiveItems}
                />
            )}

            {showCreate && (
                <CreatePoDialog
                    medications={medications}
                    loading={actionLoading}
                    onClose={() => setShowCreate(false)}
                    onCreate={createPo}
                />
            )}
        </DashboardLayout>
    )
}
