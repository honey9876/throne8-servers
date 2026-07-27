import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import sanitizeHtml from 'sanitize-html';

// ==================== CONSTANTS ====================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY as string; // 32 bytes for AES-256
const IV_LENGTH = 16; // AES block size

// UUID v4 validation regex
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// URL validation regex (HTTPS only)
const URL_PATTERN = /^(https):\/\/[^ "]+$/;

// ==================== TYPE DEFINITIONS ====================

type SanitizableValue = string | number | boolean | null | undefined;
type SanitizableObject = { [key: string]: SanitizableValue | SanitizableObject | SanitizableArray };
type SanitizableArray = (SanitizableValue | SanitizableObject | SanitizableArray)[];
type SanitizableInput = SanitizableValue | SanitizableObject | SanitizableArray;

// ==================== VALIDATION UTILITIES ====================

/**
 * Validates if a string is a valid HTTPS URL
 * @param url - The URL string to validate
 * @returns True if valid HTTPS URL, false otherwise
 */
export const validateUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }
  return URL_PATTERN.test(url);
};

/**
 * Validates if a string is a valid UUID v4
 * @param id - The ID string to validate
 * @returns True if valid UUID v4, false otherwise
 */
export const validId = (id: string): boolean => {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return UUID_V4_REGEX.test(id);
};

/**
 * Sanitizes and validates a user ID
 * Removes 'user-' prefix if present and validates UUID format
 * @param userId - The user ID to sanitize
 * @returns Cleaned and validated user ID
 * @throws Error if user ID is invalid or missing
 */
export const sanitizeUserId = (userId: string): string => {
  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required');
  }

  let cleanId = userId.trim();

  // Remove 'user-' prefix if present
  if (cleanId.startsWith('user-')) {
    cleanId = cleanId.replace('user-', '').trim();
  }

  // Validate UUID format
  if (!UUID_V4_REGEX.test(cleanId)) {
    throw new Error('Invalid user ID format');
  }

  return cleanId;
};

/**
 * Recursively sanitizes input to remove HTML and prevent XSS attacks
 * @param input - The input to sanitize (string, object, or array)
 * @returns Sanitized input with the same structure
 */
export const sanitizeInput = <T extends SanitizableInput>(input: T): T => {
  if (!input) {
    return input;
  }

  // Handle arrays
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item)) as T;
  }

  // Handle primitive types
  if (typeof input !== 'object') {
    return input;
  }

  // Handle objects
  const sanitized: { [key: string]: any } = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      // Sanitize string values
      sanitized[key] = sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
      });
    } else if (Array.isArray(value)) {
      // Recursively sanitize arrays
      sanitized[key] = value.map((item) => sanitizeInput(item));
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeInput(value);
    } else {
      // Keep other types as-is (numbers, booleans, null)
      sanitized[key] = value;
    }
  }

  return sanitized as T;
};

// ==================== ID GENERATION ====================

/**
 * Generates a cryptographically secure UUID v4
 * @returns A new UUID v4 string
 */
export const generateSecureId = (): string => {
  return uuidv4();
};

// ==================== ENCRYPTION UTILITIES ====================

/**
 * Encrypts text using AES-256-CBC encryption
 * @param text - The text to encrypt
 * @returns Encrypted string in format 'iv:encryptedData' or original value if empty
 * @throws Error if encryption key is not configured
 */
export function encryptData(text: string | null | undefined): string | null | undefined {
  if (!text) {
    return text;
  }

  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not configured');
  }

  if (ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes for AES-256');
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'utf8'),
      iv
    );

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error : any) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts text that was encrypted using encryptData
 * @param encrypted - The encrypted string in format 'iv:encryptedData'
 * @returns Decrypted string or original value if empty
 * @throws Error if encryption key is not configured or decryption fails
 */
export function decryptData(encrypted: string | null | undefined): string | null | undefined {
  if (!encrypted) {
    return encrypted;
  }

  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not configured');
  }

  if (ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes for AES-256');
  }

  try {
    const parts = encrypted.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');

    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'utf8'),
      iv
    );

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error : any) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ==================== HASHING UTILITIES ====================

/**
 * Creates a SHA-256 hash of the input
 * @param data - The data to hash
 * @returns Hexadecimal hash string
 */
export const hashData = (data: string): string => {
  if (!data) {
    throw new Error('Data is required for hashing');
  }
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Creates an HMAC signature using SHA-256
 * @param data - The data to sign
 * @param secret - The secret key for signing
 * @returns Hexadecimal HMAC signature
 */
export const createHmacSignature = (data: string, secret: string): string => {
  if (!data || !secret) {
    throw new Error('Both data and secret are required for HMAC');
  }
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};

/**
 * Verifies an HMAC signature
 * @param data - The original data
 * @param signature - The signature to verify
 * @param secret - The secret key used for signing
 * @returns True if signature is valid, false otherwise
 */
export const verifyHmacSignature = (
  data: string,
  signature: string,
  secret: string
): boolean => {
  if (!data || !signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = createHmacSignature(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
};

// ==================== RANDOM GENERATION ====================

/**
 * Generates a cryptographically secure random token
 * @param length - The length of the token in bytes (default: 32)
 * @returns Hexadecimal random token string
 */
export const generateSecureToken = (length: number = 32): string => {
  if (length <= 0) {
    throw new Error('Token length must be greater than 0');
  }
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generates a random integer between min and max (inclusive)
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer
 */
export const generateSecureRandomInt = (min: number, max: number): number => {
  if (min > max) {
    throw new Error('Min must be less than or equal to max');
  }
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = Math.pow(256, bytesNeeded);
  const threshold = maxValue - (maxValue % range);

  let randomValue: number;
  do {
    const randomBytes = crypto.randomBytes(bytesNeeded);
    randomValue = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = randomValue * 256 + randomBytes[i];
    }
  } while (randomValue >= threshold);

  return min + (randomValue % range);
};

// ==================== EXPORTS ====================

export default {
  validateUrl,
  validId,
  sanitizeUserId,
  sanitizeInput,
  generateSecureId,
  encryptData,
  decryptData,
  hashData,
  createHmacSignature,
  verifyHmacSignature,
  generateSecureToken,
  generateSecureRandomInt,
};