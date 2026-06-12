'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { FlaskConical, Plus, Loader2, Trash2, Search, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLabServices } from '@/hooks/cms/use-lab-services'
import { useMasterLabServices } from '@/hooks/cms/use-master-lab-services'

export default function LabServicesPage() {
    const { grouped, loading, actionLoading, add, remove, addedLoincs, refresh } = useLabServices()
    const master = useMasterLabServices()

    const [showDialog, setShowDialog] = useState(false)
    const [addingId, setAddingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const openDialog = () => setShowDialog(true)

    const handleAdd = async (item: { id: string; name: string; loinc_code: string }) => {
        setAddingId(item.id)
        const { ok, error } = await add(item.id)
        if (ok) toast.success(`${item.name} berhasil ditambahkan`)
        else toast.error(error ?? 'Gagal menambahkan layanan')
        setAddingId(null)
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Hapus layanan "${name}" dari daftar klinik?`)) return
        setDeletingId(id)
        const { ok, error } = await remove(id)
        if (ok) toast.success(`${name} dihapus`)
        else toast.error(error ?? 'Gagal menghapus layanan')
        setDeletingId(null)
    }

    const totalSaved = Object.values(grouped).reduce((n, items) => n + items.length, 0)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <FlaskConical className="w-8 h-8 text-primary" />
                        Layanan Laboratorium
                    </h1>
                    <p className="text-foreground/60 mt-1">
                        Kelola daftar pemeriksaan lab yang tersedia di klinik
                    </p>
                </div>
                <Button onClick={openDialog} className="gap-2">
                    <Plus className="w-4 h-4" /> Tambah Layanan
                </Button>
            </div>

            {totalSaved === 0 ? (
                <EmptyState onAdd={openDialog} />
            ) : (
                Object.entries(grouped).map(([category, items]) => (
                    <Card key={category} className="border border-border/40">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Badge variant="secondary">{category}</Badge>
                                <span className="text-foreground/50 text-sm font-normal">{items.length} layanan</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className='w-[60%]'>Nama Pemeriksaan</TableHead>
                                        <TableHead>LOINC</TableHead>
                                        <TableHead className="w-16 text-right">Hapus</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map(svc => (
                                        <TableRow key={svc.id}>
                                            <TableCell className="font-medium">{svc.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-mono text-xs">{svc.loinc_code}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={deletingId === svc.id || actionLoading}
                                                    onClick={() => handleDelete(svc.id, svc.name)}
                                                >
                                                    {deletingId === svc.id
                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                        : <Trash2 className="w-4 h-4 text-destructive/80" />
                                                    }
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ))
            )}

            <MasterPickerDialog
                open={showDialog}
                onClose={() => setShowDialog(false)}
                master={master}
                addedLoincs={addedLoincs}
                addingId={addingId}
                onAdd={handleAdd}
            />
        </div>
    )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
    return (
        <Card className="border border-border/40">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-foreground/40">
                <FlaskConical className="w-10 h-10" />
                <p className="text-sm">Belum ada layanan lab yang ditambahkan</p>
                <Button variant="outline" size="sm" onClick={onAdd} className="mt-2 gap-2">
                    <Plus className="w-4 h-4" /> Tambah Layanan
                </Button>
            </CardContent>
        </Card>
    )
}

function MasterPickerDialog({
    open,
    onClose,
    master,
    addedLoincs,
    addingId,
    onAdd,
}: {
    open: boolean
    onClose: () => void
    master: ReturnType<typeof useMasterLabServices>
    addedLoincs: Set<string>
    addingId: string | null
    onAdd: (item: { id: string; name: string; loinc_code: string }) => void
}) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Tambah Layanan Lab dari Master</DialogTitle>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <Input
                        className="pl-9"
                        placeholder="Cari nama pemeriksaan atau kode LOINC..."
                        value={master.query}
                        onChange={e => master.setQuery(e.target.value)}
                    />
                </div>

                <div className="border rounded-lg overflow-auto max-h-[400px]">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                <TableHead>Nama</TableHead>
                                <TableHead>Kategori</TableHead>
                                <TableHead>Spesimen</TableHead>
                                <TableHead>LOINC</TableHead>
                                <TableHead className="w-24" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {master.loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-10">
                                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : master.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-10 text-foreground/40 text-sm">
                                        Tidak ada hasil
                                    </TableCell>
                                </TableRow>
                            ) : (
                                master.data.map(item => {
                                    const already = addedLoincs.has(item.loinc_code)
                                    return (
                                        <TableRow key={item.id} className={already ? 'opacity-50' : ''}>
                                            <TableCell className="font-medium text-sm">
                                                {item.name}
                                                {item.loinc_display && item.loinc_display !== item.name && (
                                                    <p className="text-xs text-foreground/40 font-normal mt-0.5">{item.loinc_display}</p>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-xs">{item.category ?? '-'}</Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-foreground/60">{item.specimen_type ?? '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-mono text-xs">{item.loinc_code}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {already ? (
                                                    <span className="flex items-center justify-end gap-1 text-xs text-emerald-600">
                                                        <CheckCircle2 className="w-4 h-4" /> Ditambahkan
                                                    </span>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={addingId === item.id}
                                                        onClick={() => onAdd(item)}
                                                        className="gap-1.5"
                                                    >
                                                        {addingId === item.id
                                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                                            : <Plus className="w-3 h-3" />
                                                        }
                                                        Tambah
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {master.totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-foreground/60">
                        <span>{master.total} hasil ditemukan</span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                disabled={master.page <= 1 || master.loading}
                                onClick={() => master.goToPage(master.page - 1)}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span>Hal. {master.page} / {master.totalPages}</span>
                            <Button
                                variant="outline"
                                size="icon"
                                disabled={master.page >= master.totalPages || master.loading}
                                onClick={() => master.goToPage(master.page + 1)}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Tutup</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
