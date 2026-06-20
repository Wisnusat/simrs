'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, UserPlus, CheckCircle2 } from 'lucide-react'

const TITLE_PREFIXES = ['dr.', 'drg.', 'Ns.', 'S.Kep.', 'Apt.', 'S.Farm.', 'Amd.Kep.', 'Amd.Gz.', 'S.Gz.', 'S.K.M.', '—']

const ROLE_OPTIONS = [
    { value: 'doctor',       label: 'Dokter' },
    { value: 'nurse',        label: 'Perawat' },
    { value: 'pharmacist',   label: 'Apoteker' },
    { value: 'lab_nurse',    label: 'Perawat Lab' },
    { value: 'nutritionist', label: 'Ahli Gizi' },
    { value: 'cashier',      label: 'Kasir' },
    { value: 'admin',        label: 'Admin' },
]

const SPECIALIZATIONS: Record<string, string[]> = {
    doctor: [
        'Dokter Umum',
        'Dokter Gigi Umum',
        'Sp. Obstetri & Ginekologi (Sp.OG)',
        'Sp. Bedah Umum (Sp.B)',
        'Sp. Bedah Ortopedi (Sp.OT)',
        'Sp. Anestesiologi (Sp.An)',
        'Sp. Penyakit Dalam (Sp.PD)',
        'Sp. Anak (Sp.A)',
        'Sp. Jantung & Pembuluh Darah (Sp.JP)',
        'Sp. Saraf (Sp.S)',
        'Sp. Radiologi (Sp.Rad)',
        'Sp. Patologi Klinik (Sp.PK)',
        'Sp. Mata (Sp.M)',
        'Sp. THT (Sp.THT-KL)',
        'Sp. Kulit & Kelamin (Sp.KK)',
        'Sp. Paru (Sp.P)',
        'Sp. Urologi (Sp.U)',
        'Lainnya',
    ],
    nurse: ['Perawat Umum', 'Perawat IGD', 'Perawat ICU', 'Perawat Bedah', 'Perawat Maternitas', 'Perawat Pediatri'],
    pharmacist: ['Apoteker Klinis', 'Apoteker Rawat Inap', 'Apoteker Rawat Jalan'],
    lab_nurse: ['Analis Laboratorium', 'Perawat Laboratorium'],
    nutritionist: ['Ahli Gizi Klinik', 'Ahli Gizi Komunitas'],
}

interface FormState {
    prefix: string
    full_name: string
    nik: string
    gender: string
    role: string
    specialization: string
    str_number: string
    sip_number: string
    phone: string
    email: string
    password: string
    confirm_password: string
}

export default function RegisterForm() {
    const router = useRouter()
    const [step, setStep] = useState<'form' | 'success'>('form')
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [serverError, setServerError] = useState('')
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
    const [registeredName, setRegisteredName] = useState('')

    const [form, setForm] = useState<FormState>({
        prefix: 'dr.',
        full_name: '',
        nik: '',
        gender: '',
        role: '',
        specialization: '',
        str_number: '',
        sip_number: '',
        phone: '',
        email: '',
        password: '',
        confirm_password: '',
    })

    const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    }

    const validate = (): boolean => {
        const e: Partial<Record<keyof FormState, string>> = {}
        if (!form.full_name.trim()) e.full_name = 'Nama lengkap wajib diisi'
        if (!form.nik.trim()) e.nik = 'NIK wajib diisi'
        else if (!/^\d{16}$/.test(form.nik.trim())) e.nik = 'NIK harus 16 digit angka'
        if (!form.gender) e.gender = 'Jenis kelamin wajib dipilih'
        if (!form.role) e.role = 'Role wajib dipilih'
        if (form.role === 'doctor' && !form.specialization) e.specialization = 'Spesialisasi wajib dipilih untuk dokter'
        if (!form.email.trim()) e.email = 'Email wajib diisi'
        else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Format email tidak valid'
        if (!form.password) e.password = 'Password wajib diisi'
        else if (form.password.length < 8) e.password = 'Password minimal 8 karakter'
        if (form.password !== form.confirm_password) e.confirm_password = 'Password tidak cocok'
        setErrors(e)
        return Object.keys(e).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return

        setIsLoading(true)
        setServerError('')

        const fullNameWithPrefix = form.prefix === '—'
            ? form.full_name.trim()
            : `${form.prefix} ${form.full_name.trim()}`

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: fullNameWithPrefix,
                    nik: form.nik.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    role: form.role,
                    gender: form.gender,
                    phone: form.phone.trim() || null,
                    specialization: form.specialization || null,
                    str_number: form.str_number.trim() || null,
                    sip_number: form.sip_number.trim() || null,
                }),
            })

            const data = await res.json()

            if (!res.ok || !data.success) {
                setServerError(data.error ?? 'Pendaftaran gagal. Coba lagi.')
                return
            }

            setRegisteredName(data.data.full_name)
            setStep('success')
        } catch {
            setServerError('Terjadi kesalahan jaringan. Periksa koneksi Anda.')
        } finally {
            setIsLoading(false)
        }
    }

    if (step === 'success') {
        return (
            <div className="bg-card p-8 rounded-xl border border-border/40 shadow-sm text-center space-y-4">
                <div className="flex justify-center">
                    <CheckCircle2 className="w-14 h-14 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Pendaftaran Berhasil</h2>
                <p className="text-foreground/60 text-sm">
                    Akun untuk <span className="font-semibold text-foreground">{registeredName}</span> telah dibuat.
                    Silakan masuk menggunakan email dan password yang telah didaftarkan.
                </p>
                <Button className="w-full mt-2" onClick={() => router.push('/')}>
                    Masuk Sekarang
                </Button>
            </div>
        )
    }

    const specializationOptions = SPECIALIZATIONS[form.role] ?? []
    const inputClass = (field: keyof FormState) =>
        `w-full px-4 py-2.5 rounded-lg border bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm ${errors[field] ? 'border-destructive' : 'border-border'}`
    const selectClass = (field: keyof FormState) =>
        `w-full px-4 py-2.5 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm ${errors[field] ? 'border-destructive' : 'border-border'}`

    return (
        <form onSubmit={handleSubmit} className="bg-card p-8 rounded-xl border border-border/40 shadow-sm space-y-6">

            {/* ── Identitas Diri ─────────────────────────────── */}
            <div>
                <h2 className="text-sm font-semibold text-foreground/50 uppercase tracking-wider mb-4">Identitas Diri</h2>
                <div className="space-y-4">

                    {/* Prefix + Nama */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Nama Lengkap <span className="text-destructive">*</span></label>
                        <div className="flex gap-2">
                            <select
                                value={form.prefix}
                                onChange={set('prefix')}
                                className="px-3 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm shrink-0"
                            >
                                {TITLE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <input
                                type="text"
                                value={form.full_name}
                                onChange={set('full_name')}
                                placeholder="Ahmad Santoso"
                                className={inputClass('full_name')}
                                disabled={isLoading}
                            />
                        </div>
                        {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
                    </div>

                    {/* NIK */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">
                            NIK <span className="text-destructive">*</span>
                            <span className="text-xs text-foreground/40 ml-1 font-normal">(16 digit)</span>
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={16}
                            value={form.nik}
                            onChange={set('nik')}
                            placeholder="3271XXXXXXXXXXXX"
                            className={inputClass('nik')}
                            disabled={isLoading}
                        />
                        {errors.nik && <p className="text-xs text-destructive">{errors.nik}</p>}
                    </div>

                    {/* Gender */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Jenis Kelamin <span className="text-destructive">*</span></label>
                        <select value={form.gender} onChange={set('gender')} className={selectClass('gender')} disabled={isLoading}>
                            <option value="">Pilih jenis kelamin</option>
                            <option value="male">Laki-laki</option>
                            <option value="female">Perempuan</option>
                        </select>
                        {errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
                    </div>
                </div>
            </div>

            {/* ── Profesi ─────────────────────────────────────── */}
            <div>
                <h2 className="text-sm font-semibold text-foreground/50 uppercase tracking-wider mb-4">Profesi</h2>
                <div className="space-y-4">

                    {/* Role */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Peran / Jabatan <span className="text-destructive">*</span></label>
                        <select
                            value={form.role}
                            onChange={(e) => {
                                setForm(f => ({ ...f, role: e.target.value, specialization: '' }))
                                if (errors.role) setErrors(p => ({ ...p, role: '' }))
                            }}
                            className={selectClass('role')}
                            disabled={isLoading}
                        >
                            <option value="">Pilih peran</option>
                            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
                    </div>

                    {/* Specialization */}
                    {specializationOptions.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-foreground">
                                Spesialisasi {form.role === 'doctor' && <span className="text-destructive">*</span>}
                            </label>
                            <select value={form.specialization} onChange={set('specialization')} className={selectClass('specialization')} disabled={isLoading}>
                                <option value="">Pilih spesialisasi</option>
                                {specializationOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {errors.specialization && <p className="text-xs text-destructive">{errors.specialization}</p>}
                        </div>
                    )}

                    {/* STR + SIP (two-col) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-foreground">
                                No. STR
                                <span className="text-xs text-foreground/40 ml-1 font-normal">(opsional)</span>
                            </label>
                            <input
                                type="text"
                                value={form.str_number}
                                onChange={set('str_number')}
                                placeholder="44.3.3.1.XXXXX"
                                className={inputClass('str_number')}
                                disabled={isLoading}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-foreground">
                                No. SIP
                                <span className="text-xs text-foreground/40 ml-1 font-normal">(opsional)</span>
                            </label>
                            <input
                                type="text"
                                value={form.sip_number}
                                onChange={set('sip_number')}
                                placeholder="503/DINKES-SIP/XXXXX"
                                className={inputClass('sip_number')}
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Kontak & Akun ───────────────────────────────── */}
            <div>
                <h2 className="text-sm font-semibold text-foreground/50 uppercase tracking-wider mb-4">Kontak &amp; Akun</h2>
                <div className="space-y-4">

                    {/* Phone */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">
                            No. HP
                            <span className="text-xs text-foreground/40 ml-1 font-normal">(opsional)</span>
                        </label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={set('phone')}
                            placeholder="08XXXXXXXXXX"
                            className={inputClass('phone')}
                            disabled={isLoading}
                        />
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Email <span className="text-destructive">*</span></label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={set('email')}
                            placeholder="nama@klinik.id"
                            className={inputClass('email')}
                            disabled={isLoading}
                        />
                        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Password <span className="text-destructive">*</span></label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={form.password}
                                onChange={set('password')}
                                placeholder="Minimal 8 karakter"
                                className={inputClass('password')}
                                disabled={isLoading}
                            />
                            <button type="button" onClick={() => setShowPassword(v => !v)} disabled={isLoading}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground transition-colors">
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-foreground">Konfirmasi Password <span className="text-destructive">*</span></label>
                        <div className="relative">
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={form.confirm_password}
                                onChange={set('confirm_password')}
                                placeholder="Ulangi password"
                                className={inputClass('confirm_password')}
                                disabled={isLoading}
                            />
                            <button type="button" onClick={() => setShowConfirm(v => !v)} disabled={isLoading}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground transition-colors">
                                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password}</p>}
                    </div>
                </div>
            </div>

            {/* Error */}
            {serverError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {serverError}
                </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={isLoading} className="w-full h-11 gap-2">
                {isLoading ? (
                    <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Mendaftarkan...</>
                ) : (
                    <><UserPlus size={18} /> Daftar Sebagai Staf</>
                )}
            </Button>
        </form>
    )
}
