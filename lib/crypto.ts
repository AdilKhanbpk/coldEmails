import crypto from 'crypto';

// AES-256-GCM encryption for credentials at rest.
// The encryption key is derived from ENCRYPTION_KEY or NEXTAUTH_SECRET env var.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'fallback-key-not-secure';
  return crypto.createHash('sha256').update(raw).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decrypt(ciphertext: string): string {
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptJSON(obj: unknown): string {
  return encrypt(JSON.stringify(obj));
}

export function decryptJSON<T = unknown>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T;
}
