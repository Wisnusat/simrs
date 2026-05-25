/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Globe, Save, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type SectionKey = 'hero' | 'about' | 'services' | 'faq' | 'contact' | 'stats'

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
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                    <TabsTrigger value="hero">Hero</TabsTrigger>
                    <TabsTrigger value="about">About</TabsTrigger>
                    <TabsTrigger value="services">Services</TabsTrigger>
                    <TabsTrigger value="faq">FAQ</TabsTrigger>
                    <TabsTrigger value="contact">Contact</TabsTrigger>
                    <TabsTrigger value="stats">Stats</TabsTrigger>
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
