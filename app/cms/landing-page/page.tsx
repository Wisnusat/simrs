/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Globe, Save, Loader2, Plus, Trash2, Upload, Image as ImageIcon, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type SectionKey = 'hero' | 'about' | 'services' | 'faq' | 'contact' | 'stats' | 'gallery'

export default function LandingPageCmsPage() {
    const [sections, setSections] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(true)
    const [savingKey, setSavingKey] = useState<string | null>(null)

    const fetchContent = useCallback(async () => {
        try {
            const res = await fetch('/api/cms/content')
            if (res.ok) {
                const data = await res.json()
                const map: Record<string, any> = {}
                for (const item of data.data ?? []) {
                    map[item.section_key] = item.content
                }
                setSections(map)
            }
        } catch (err) {
            console.error('Fetch CMS error:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchContent() }, [fetchContent])

    const saveSection = async (key: SectionKey, content: any) => {
        setSavingKey(key)
        try {
            const res = await fetch('/api/cms/content', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section_key: key, content }),
            })
            const data = await res.json()
            if (data.success) {
                toast.success(`Bagian "${key}" berhasil disimpan`)
                setSections(prev => ({ ...prev, [key]: content }))
            } else {
                toast.error(data.error ?? 'Gagal menyimpan')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setSavingKey(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <Globe className="w-8 h-8 text-primary" />
                    Landing Page CMS
                </h1>
                <p className="text-foreground/60 mt-1">
                    Kelola konten halaman utama website klinik
                </p>
            </div>

            <Tabs defaultValue="hero" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7">
                    <TabsTrigger value="hero">Hero</TabsTrigger>
                    <TabsTrigger value="about">About</TabsTrigger>
                    <TabsTrigger value="services">Services</TabsTrigger>
                    <TabsTrigger value="faq">FAQ</TabsTrigger>
                    <TabsTrigger value="contact">Contact</TabsTrigger>
                    <TabsTrigger value="stats">Stats</TabsTrigger>
                    <TabsTrigger value="gallery">Galeri</TabsTrigger>
                </TabsList>

                <TabsContent value="hero">
                    <HeroEditor
                        content={sections.hero ?? {}}
                        saving={savingKey === 'hero'}
                        onSave={(c) => saveSection('hero', c)}
                    />
                </TabsContent>

                <TabsContent value="about">
                    <AboutEditor
                        content={sections.about ?? {}}
                        saving={savingKey === 'about'}
                        onSave={(c) => saveSection('about', c)}
                    />
                </TabsContent>

                <TabsContent value="services">
                    <ServicesEditor
                        content={sections.services ?? { items: [] }}
                        saving={savingKey === 'services'}
                        onSave={(c) => saveSection('services', c)}
                    />
                </TabsContent>

                <TabsContent value="faq">
                    <FaqEditor
                        content={sections.faq ?? { items: [] }}
                        saving={savingKey === 'faq'}
                        onSave={(c) => saveSection('faq', c)}
                    />
                </TabsContent>

                <TabsContent value="contact">
                    <ContactEditor
                        content={sections.contact ?? {}}
                        saving={savingKey === 'contact'}
                        onSave={(c) => saveSection('contact', c)}
                    />
                </TabsContent>

                <TabsContent value="stats">
                    <StatsEditor
                        content={sections.stats ?? { items: [] }}
                        saving={savingKey === 'stats'}
                        onSave={(c) => saveSection('stats', c)}
                    />
                </TabsContent>

                <TabsContent value="gallery">
                    <GalleryEditor
                        content={sections.gallery ?? { items: [] }}
                        saving={savingKey === 'gallery'}
                        onSave={(c) => saveSection('gallery', c)}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}

// ─── Section Editors ─────────────────────────────────────────────────────────

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
    return (
        <Button onClick={onClick} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan
        </Button>
    )
}

function HeroEditor({ content, saving, onSave }: { content: any; saving: boolean; onSave: (c: any) => void }) {
    const [form, setForm] = useState({
        title: content.title ?? 'Your Trusted Healthcare Partner',
        subtitle: content.subtitle ?? '',
        cta_primary_text: content.cta_primary_text ?? 'Register Online',
        cta_secondary_text: content.cta_secondary_text ?? 'View Services',
    })

    return (
        <Card className="border border-border/40">
            <CardHeader>
                <CardTitle>Hero Section</CardTitle>
                <CardDescription>Bagian utama yang pertama kali dilihat pengunjung</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Judul Utama</Label>
                    <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>Sub-judul</Label>
                    <Textarea value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Tombol Utama</Label>
                        <Input value={form.cta_primary_text} onChange={e => setForm(f => ({ ...f, cta_primary_text: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Tombol Sekunder</Label>
                        <Input value={form.cta_secondary_text} onChange={e => setForm(f => ({ ...f, cta_secondary_text: e.target.value }))} />
                    </div>
                </div>
                <div className="flex justify-end">
                    <SaveButton saving={saving} onClick={() => onSave(form)} />
                </div>
            </CardContent>
        </Card>
    )
}

function AboutEditor({ content, saving, onSave }: { content: any; saving: boolean; onSave: (c: any) => void }) {
    const [form, setForm] = useState({
        title: content.title ?? 'About Our Klinik',
        description: content.description ?? '',
        sub_description: content.sub_description ?? '',
        highlights: content.highlights ?? [
            { title: '', description: '' },
        ],
    })

    const addHighlight = () => {
        setForm(f => ({ ...f, highlights: [...f.highlights, { title: '', description: '' }] }))
    }

    const removeHighlight = (idx: number) => {
        setForm(f => ({ ...f, highlights: f.highlights.filter((_: any, i: number) => i !== idx) }))
    }

    return (
        <Card className="border border-border/40">
            <CardHeader>
                <CardTitle>About Section</CardTitle>
                <CardDescription>Informasi tentang klinik</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Judul</Label>
                    <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>Deskripsi</Label>
                    <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                </div>
                <div className="space-y-2">
                    <Label>Sub-deskripsi</Label>
                    <Textarea value={form.sub_description} onChange={e => setForm(f => ({ ...f, sub_description: e.target.value }))} rows={2} />
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label>Highlights</Label>
                        <Button variant="outline" size="sm" onClick={addHighlight} className="gap-1">
                            <Plus className="w-3 h-3" /> Tambah
                        </Button>
                    </div>
                    {form.highlights.map((h: any, i: number) => (
                        <div key={i} className="flex gap-3 items-start p-3 border border-border/40 rounded-lg">
                            <div className="flex-1 space-y-2">
                                <Input
                                    placeholder="Judul highlight"
                                    value={h.title}
                                    onChange={e => {
                                        const updated = [...form.highlights]
                                        updated[i] = { ...updated[i], title: e.target.value }
                                        setForm(f => ({ ...f, highlights: updated }))
                                    }}
                                />
                                <Input
                                    placeholder="Deskripsi"
                                    value={h.description}
                                    onChange={e => {
                                        const updated = [...form.highlights]
                                        updated[i] = { ...updated[i], description: e.target.value }
                                        setForm(f => ({ ...f, highlights: updated }))
                                    }}
                                />
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeHighlight(i)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end">
                    <SaveButton saving={saving} onClick={() => onSave(form)} />
                </div>
            </CardContent>
        </Card>
    )
}

function ServicesEditor({ content, saving, onSave }: { content: any; saving: boolean; onSave: (c: any) => void }) {
    const [items, setItems] = useState<any[]>(content.items ?? [])

    const addItem = () => {
        setItems([...items, { name: '', description: '', hours: '' }])
    }

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx))
    }

    return (
        <Card className="border border-border/40">
            <CardHeader>
                <CardTitle>Services Section</CardTitle>
                <CardDescription>Daftar layanan yang ditampilkan di landing page</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label>Layanan ({items.length})</Label>
                    <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
                        <Plus className="w-3 h-3" /> Tambah
                    </Button>
                </div>
                {items.map((item: any, i: number) => (
                    <div key={i} className="p-4 border border-border/40 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground/60">Layanan #{i + 1}</span>
                            <Button variant="ghost" size="sm" onClick={() => removeItem(i)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Nama</Label>
                                <Input
                                    value={item.name}
                                    onChange={e => {
                                        const updated = [...items]
                                        updated[i] = { ...updated[i], name: e.target.value }
                                        setItems(updated)
                                    }}
                                    placeholder="General Practitioner"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Jam Layanan</Label>
                                <Input
                                    value={item.hours}
                                    onChange={e => {
                                        const updated = [...items]
                                        updated[i] = { ...updated[i], hours: e.target.value }
                                        setItems(updated)
                                    }}
                                    placeholder="Mon–Fri: 08:00–17:00"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Deskripsi</Label>
                            <Input
                                value={item.description}
                                onChange={e => {
                                    const updated = [...items]
                                    updated[i] = { ...updated[i], description: e.target.value }
                                    setItems(updated)
                                }}
                                placeholder="Comprehensive primary healthcare services"
                            />
                        </div>
                    </div>
                ))}
                <div className="flex justify-end">
                    <SaveButton saving={saving} onClick={() => onSave({ items })} />
                </div>
            </CardContent>
        </Card>
    )
}

function FaqEditor({ content, saving, onSave }: { content: any; saving: boolean; onSave: (c: any) => void }) {
    const [items, setItems] = useState<any[]>(content.items ?? [])

    const addItem = () => {
        setItems([...items, { question: '', answer: '' }])
    }

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx))
    }

    return (
        <Card className="border border-border/40">
            <CardHeader>
                <CardTitle>FAQ Section</CardTitle>
                <CardDescription>Pertanyaan yang sering diajukan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label>FAQ ({items.length})</Label>
                    <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
                        <Plus className="w-3 h-3" /> Tambah
                    </Button>
                </div>
                {items.map((item: any, i: number) => (
                    <div key={i} className="p-4 border border-border/40 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground/60">FAQ #{i + 1}</span>
                            <Button variant="ghost" size="sm" onClick={() => removeItem(i)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                        </div>
                        <div className="space-y-2">
                            <Input
                                placeholder="Pertanyaan"
                                value={item.question}
                                onChange={e => {
                                    const updated = [...items]
                                    updated[i] = { ...updated[i], question: e.target.value }
                                    setItems(updated)
                                }}
                            />
                            <Textarea
                                placeholder="Jawaban"
                                value={item.answer}
                                rows={2}
                                onChange={e => {
                                    const updated = [...items]
                                    updated[i] = { ...updated[i], answer: e.target.value }
                                    setItems(updated)
                                }}
                            />
                        </div>
                    </div>
                ))}
                <div className="flex justify-end">
                    <SaveButton saving={saving} onClick={() => onSave({ items })} />
                </div>
            </CardContent>
        </Card>
    )
}

function ContactEditor({ content, saving, onSave }: { content: any; saving: boolean; onSave: (c: any) => void }) {
    const [form, setForm] = useState({
        address: content.address ?? '',
        phone: content.phone ?? '',
        email: content.email ?? '',
        emergency_text: content.emergency_text ?? 'Available 24/7',
    })

    return (
        <Card className="border border-border/40">
            <CardHeader>
                <CardTitle>Contact Section</CardTitle>
                <CardDescription>Informasi kontak yang ditampilkan di footer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Alamat</Label>
                    <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Jl. Kesehatan No. 123" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Telepon</Label>
                        <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(021) 1234-5678" />
                    </div>
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@klinik.com" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Teks Darurat</Label>
                    <Input value={form.emergency_text} onChange={e => setForm(f => ({ ...f, emergency_text: e.target.value }))} placeholder="Available 24/7" />
                </div>
                <div className="flex justify-end">
                    <SaveButton saving={saving} onClick={() => onSave(form)} />
                </div>
            </CardContent>
        </Card>
    )
}

function StatsEditor({ content, saving, onSave }: { content: any; saving: boolean; onSave: (c: any) => void }) {
    const [items, setItems] = useState<any[]>(content.items ?? [
        { label: 'Years Experience', value: '15+' },
        { label: 'Medical Staff', value: '50+' },
        { label: 'Happy Patients', value: '10K+' },
    ])

    const addItem = () => {
        setItems([...items, { label: '', value: '' }])
    }

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx))
    }

    return (
        <Card className="border border-border/40">
            <CardHeader>
                <CardTitle>Stats Section</CardTitle>
                <CardDescription>Angka-angka pencapaian yang ditampilkan di hero section</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label>Statistics ({items.length})</Label>
                    <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
                        <Plus className="w-3 h-3" /> Tambah
                    </Button>
                </div>
                {items.map((item: any, i: number) => (
                    <div key={i} className="flex gap-3 items-center">
                        <Input
                            placeholder="Nilai (e.g. 15+)"
                            value={item.value}
                            onChange={e => {
                                const updated = [...items]
                                updated[i] = { ...updated[i], value: e.target.value }
                                setItems(updated)
                            }}
                            className="w-32"
                        />
                        <Input
                            placeholder="Label (e.g. Years Experience)"
                            value={item.label}
                            onChange={e => {
                                const updated = [...items]
                                updated[i] = { ...updated[i], label: e.target.value }
                                setItems(updated)
                            }}
                            className="flex-1"
                        />
                        <Button variant="ghost" size="sm" onClick={() => removeItem(i)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                    </div>
                ))}
                <div className="flex justify-end">
                    <SaveButton saving={saving} onClick={() => onSave({ items })} />
                </div>
            </CardContent>
        </Card>
    )
}

function GalleryEditor({ content, saving, onSave }: { content: any; saving: boolean; onSave: (c: any) => void }) {
    const [items, setItems] = useState<any[]>(content.items ?? [])
    const [uploading, setUploading] = useState(false)
    const [manualUrl, setManualUrl] = useState('')
    const [manualTitle, setManualTitle] = useState('')
    const [showManual, setShowManual] = useState(false)

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const supabase = createClient()
            const fileExt = file.name.split('.').pop()
            const fileName = `gallery_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
            const filePath = `assets/${fileName}`

            // Upload the file to Supabase Storage in the 'assets' bucket
            const { error: uploadError } = await supabase.storage
                .from('assets')
                .upload(filePath, file, { cacheControl: '3600', upsert: true })

            if (uploadError) {
                console.error('Supabase upload error:', uploadError)
                toast.error(`Gagal upload ke Storage: ${uploadError.message}. Silakan tambahkan via URL manual di bawah.`)
                return
            }

            // Retrieve the permanent public URL
            const { data } = supabase.storage.from('assets').getPublicUrl(filePath)
            const publicUrl = data?.publicUrl

            if (!publicUrl) {
                toast.error('Gagal mendapatkan URL publik dari storage')
                return
            }

            const cleanTitle = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
            const newItem = {
                id: Math.random().toString(36).substring(2, 11),
                url: publicUrl,
                title: cleanTitle,
                is_active: true,
            }

            setItems(prev => [...prev, newItem])
            toast.success('Foto berhasil diunggah ke storage!')
        } catch (err: any) {
            console.error('Upload exception:', err)
            toast.error('Terjadi kesalahan saat mengunggah')
        } finally {
            setUploading(false)
            if (e.target) e.target.value = ''
        }
    }

    const addManualItem = () => {
        if (!manualUrl.trim()) {
            toast.error('URL gambar wajib diisi')
            return
        }

        const newItem = {
            id: Math.random().toString(36).substring(2, 11),
            url: manualUrl.trim(),
            title: manualTitle.trim() || 'Foto Klinik',
            is_active: true,
        }

        setItems(prev => [...prev, newItem])
        setManualUrl('')
        setManualTitle('')
        setShowManual(false)
        toast.success('Foto berhasil ditambahkan')
    }

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx))
        toast.success('Foto dihapus dari daftar (klik Simpan untuk menyimpan perubahan)')
    }

    const toggleActive = (idx: number) => {
        const updated = [...items]
        updated[idx] = { ...updated[idx], is_active: !updated[idx].is_active }
        setItems(updated)
    }

    const updateTitle = (idx: number, newTitle: string) => {
        const updated = [...items]
        updated[idx] = { ...updated[idx], title: newTitle }
        setItems(updated)
    }

    return (
        <Card className="border border-border/40">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    Galeri Foto & Fasilitas Klinik
                </CardTitle>
                <CardDescription>
                    Kelola foto-foto fasilitas, poliklinik, dan lingkungan Klinik yang ditampilkan di landing page.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Upload & Manual URL Area */}
                <div className="grid md:grid-cols-2 gap-4 p-4 border border-dashed border-border/60 rounded-xl bg-secondary/10">
                    {/* Supabase Storage Upload */}
                    <div className="flex flex-col items-center justify-center p-6 text-center bg-card rounded-lg border border-border/40 hover:border-primary/30 transition-colors">
                        <Upload className="w-8 h-8 text-primary/80 mb-2" />
                        <span className="text-sm font-semibold">Unggah File Foto</span>
                        <span className="text-xs text-foreground/50 mt-1 mb-4">Format PNG, JPG, JPEG (Maks 5MB)</span>
                        <Button asChild variant="outline" size="sm" className="relative cursor-pointer" disabled={uploading}>
                            <label>
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {uploading ? 'Mengunggah...' : 'Pilih File'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                            </label>
                        </Button>
                    </div>

                    {/* Manual URL Form Toggle */}
                    <div className="flex flex-col items-center justify-center p-6 text-center bg-card rounded-lg border border-border/40 hover:border-primary/30 transition-colors">
                        <ImageIcon className="w-8 h-8 text-primary/80 mb-2" />
                        <span className="text-sm font-semibold">Tambah URL Gambar</span>
                        <span className="text-xs text-foreground/50 mt-1 mb-4">Gunakan link eksternal atau Supabase Storage</span>
                        {!showManual ? (
                            <Button variant="outline" size="sm" onClick={() => setShowManual(true)}>
                                Tambah Manual
                            </Button>
                        ) : (
                            <div className="w-full space-y-2 mt-2">
                                <Input
                                    placeholder="https://example.com/image.jpg"
                                    value={manualUrl}
                                    onChange={e => setManualUrl(e.target.value)}
                                    className="text-xs h-8"
                                />
                                <Input
                                    placeholder="Judul / Keterangan foto (e.g. Lobby Depan)"
                                    value={manualTitle}
                                    onChange={e => setManualTitle(e.target.value)}
                                    className="text-xs h-8"
                                />
                                <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setShowManual(false)} className="text-xs h-7">
                                        Batal
                                    </Button>
                                    <Button size="sm" onClick={addManualItem} className="text-xs h-7">
                                        Tambah
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <Label className="text-base font-bold text-foreground">Daftar Foto ({items.length})</Label>
                    </div>

                    {items.length === 0 ? (
                        <div className="text-center py-12 border border-border/40 rounded-xl bg-card">
                            <ImageIcon className="w-12 h-12 text-foreground/20 mx-auto mb-3" />
                            <p className="text-foreground/50">Belum ada foto galeri.</p>
                            <p className="text-xs text-foreground/40 mt-1">Unggah file atau tambahkan URL manual untuk memulai.</p>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {items.map((item: any, i: number) => (
                                <div
                                    key={item.id ?? i}
                                    className={`relative p-3 border rounded-xl bg-card space-y-3 shadow-xs transition-all duration-300 hover:shadow-md ${item.is_active ? 'border-border/60' : 'border-destructive/30 opacity-70'
                                        }`}
                                >
                                    {/* Thumbnail container */}
                                    <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-secondary/20 border border-border/20">
                                        <img
                                            src={item.url}
                                            alt={item.title ?? 'Pratinjau'}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                // fallback in case of expired signature / error
                                                (e.target as HTMLImageElement).src = '/hero-clinic.jpg'
                                            }}
                                        />
                                        {/* Status badge Overlay */}
                                        <div className="absolute top-2 left-2">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold backdrop-blur-md shadow-xs text-white ${item.is_active ? 'bg-emerald-500/80' : 'bg-destructive/80'
                                                    }`}
                                            >
                                                {item.is_active ? (
                                                    <><Eye className="w-2.5 h-2.5" /> Aktif</>
                                                ) : (
                                                    <><EyeOff className="w-2.5 h-2.5" /> Nonaktif</>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Title edit & Actions */}
                                    <div className="space-y-2">
                                        <Input
                                            value={item.title ?? ''}
                                            onChange={e => updateTitle(i, e.target.value)}
                                            placeholder="Judul / Keterangan foto"
                                            className="text-xs font-semibold h-8"
                                        />
                                        <div className="flex justify-between items-center">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => toggleActive(i)}
                                                className={`text-2xs h-7 px-2 gap-1 ${item.is_active
                                                    ? 'text-foreground/80 hover:bg-secondary'
                                                    : 'text-emerald-600 hover:text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
                                                    }`}
                                            >
                                                {item.is_active ? (
                                                    <><EyeOff className="w-3 h-3" /> Sembunyikan</>
                                                ) : (
                                                    <><Eye className="w-3 h-3" /> Tampilkan</>
                                                )}
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => removeItem(i)} className="h-7 w-7 text-destructive hover:bg-destructive/10">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Save Section Action */}
                <div className="flex justify-end pt-4 border-t border-border/20">
                    <SaveButton saving={saving} onClick={() => onSave({ items })} />
                </div>
            </CardContent>
        </Card>
    )
}

