import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
    const secret = process.env.SIMRS_API_KEY || 'default_secret_key'
    return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypts an object using AES-256-GCM
 */
export function encryptData(data: any): string {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64')
    encrypted += cipher.final('base64')
    const authTag = cipher.getAuthTag()

    // Format: iv:authTag:encryptedPayload (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Decrypts an AES-256-GCM encrypted string back to an object
 */
export function decryptData(encryptedStr: string): any {
    const parts = encryptedStr.split(':')
    if (parts.length !== 3) throw new Error('Invalid encrypted format')
    
    const iv = Buffer.from(parts[0], 'base64')
    const authTag = Buffer.from(parts[1], 'base64')
    const encrypted = parts[2]

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return JSON.parse(decrypted)
}
