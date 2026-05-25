import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Text-to-Speech helper (Web Speech API — no external deps)
// ---------------------------------------------------------------------------
export function announcePatient(name: string, queueNumber?: string | number, prefix: string = "Nomor antrian", suffix: string = "silakan masuk") {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  // Cancel any ongoing speech first
  window.speechSynthesis.cancel()

  const text = queueNumber 
    ? `${prefix} ${queueNumber}, ${name}, ${suffix}.`
    : `Pasien atas nama ${name}, ${suffix}.`
    
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = "id-ID"
  utterance.rate = 0.85
  utterance.pitch = 1.0
  utterance.volume = 1.0

  // Repeat once after a short pause (common in clinic PA systems)
  utterance.onend = () => {
    setTimeout(() => {
      const repeat = new SpeechSynthesisUtterance(text)
      repeat.lang = "id-ID"
      repeat.rate = 0.85
      window.speechSynthesis.speak(repeat)
    }, 600)
  }

  window.speechSynthesis.speak(utterance)
}
