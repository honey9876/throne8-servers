import CryptoJS from 'crypto-js';
import crypto from 'crypto';
import logger from './logger';

/**
 * Get encryption key from environment
 */
const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    logger.warn('ENCRYPTION_KEY not found in environment, using default (NOT SECURE FOR PRODUCTION)');
    return 'default-encryption-key-change-in-production';
  }
  return key;
};

/**
 * Encrypt data using AES encryption
 */
export function encrypt(data: string): string {
  try {
    const encryptionKey = getEncryptionKey();
    const encrypted = CryptoJS.AES.encrypt(data, encryptionKey).toString();
    return encrypted;
  } catch (error : any) {
    logger.error('Encryption failed', { error: (error as Error).message });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES encryption
 */
export function decrypt(encryptedData: string): string {
  try {
    const encryptionKey = getEncryptionKey();
    const decrypted = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
    const originalData = decrypted.toString(CryptoJS.enc.Utf8);

    if (!originalData) {
      throw new Error('Decryption resulted in empty string');
    }

    return originalData;
  } catch (error : any) {
    logger.error('Decryption failed', { error: (error as Error).message });
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Encrypt object data
 */
export function encryptObject(obj: Record<string, unknown>): string {
  try {
    const jsonString = JSON.stringify(obj);
    return encrypt(jsonString);
  } catch (error : any) {
    logger.error('Object encryption failed', { error: (error as Error).message });
    throw new Error('Failed to encrypt object');
  }
}

/**
 * Decrypt object data
 */
export function decryptObject<T = Record<string, unknown>>(encryptedData: string): T {
  try {
    const decryptedString = decrypt(encryptedData);
    return JSON.parse(decryptedString) as T;
  } catch (error : any) {
    logger.error('Object decryption failed', { error: (error as Error).message });
    throw new Error('Failed to decrypt object');
  }
}

/**
 * Hash data using SHA256
 */
export function hash(data: string): string {
  try {
    return CryptoJS.SHA256(data).toString();
  } catch (error : any) {
    logger.error('Hashing failed', { error: (error as Error).message });
    throw new Error('Failed to hash data');
  }
}

/**
 * Generate random token
 */
export function generateToken(length: number = 32): string {
  try {
    return crypto.randomBytes(length).toString('hex');
  } catch (error : any) {
    logger.error('Token generation failed', { error: (error as Error).message });
    throw new Error('Failed to generate token');
  }
}

/**
 * Generate random UUID
 */
export function generateUUID(): string {
  try {
    return crypto.randomUUID();
  } catch (error : any) {
    logger.error('UUID generation failed', { error: (error as Error).message });
    throw new Error('Failed to generate UUID');
  }
}

/**
 * Compare hash with plain data
 */
export function compareHash(plainData: string, hashedData: string): boolean {
  try {
    const hashedPlainData = hash(plainData);
    return hashedPlainData === hashedData;
  } catch (error : any) {
    logger.error('Hash comparison failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Encrypt sensitive fields in object
 */
export function encryptSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  fieldsToEncrypt: string[]
): T {
  try {
    const encryptedObj = { ...obj };

    fieldsToEncrypt.forEach((field) => {
      if (encryptedObj[field]) {
        (encryptedObj as Record<string, unknown>)[field] = encrypt(String(encryptedObj[field]));
      }
    });

    return encryptedObj;
  } catch (error : any) {
    logger.error('Field encryption failed', { error: (error as Error).message });
    throw new Error('Failed to encrypt sensitive fields');
  }
}

/**
 * Decrypt sensitive fields in object
 */
export function decryptSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  fieldsToDecrypt: string[]
): T {
  try {
    const decryptedObj = { ...obj };

    fieldsToDecrypt.forEach((field) => {
      if (decryptedObj[field]) {
        (decryptedObj as Record<string, unknown>)[field] = decrypt(String(decryptedObj[field]));
      }
    });

    return decryptedObj;
  } catch (error : any) {
    logger.error('Field decryption failed', { error: (error as Error).message });
    throw new Error('Failed to decrypt sensitive fields');
  }
}

/**
 * HMAC signing for data integrity
 */
export function signData(data: string): string {
  try {
    const secret = getEncryptionKey();
    return CryptoJS.HmacSHA256(data, secret).toString();
  } catch (error : any) {
    logger.error('Data signing failed', { error: (error as Error).message });
    throw new Error('Failed to sign data');
  }
}

/**
 * Verify HMAC signature
 */
export function verifySignature(data: string, signature: string): boolean {
  try {
    const expectedSignature = signData(data);
    return expectedSignature === signature;
  } catch (error : any) {
    logger.error('Signature verification failed', { error: (error as Error).message });
    return false;
  }
}

export default {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  hash,
  generateToken,
  generateUUID,
  compareHash,
  encryptSensitiveFields,
  decryptSensitiveFields,
  signData,
  verifySignature,
};