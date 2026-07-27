import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt);
const pbkdf2Async = promisify(crypto.pbkdf2);
const randomBytesAsync = promisify(crypto.randomBytes);

interface EncryptResult {
    encrypted: string;
    iv: string;
    authTag: string;
    algorithm: string;
}

interface KeyPair {
    keyId: string;
    key: string;
    iv: string;
}

interface DerivedKey {
    key: string;
    salt: string;
    iterations?: number;
}

interface RSAKeyPair {
    publicKey: string;
    privateKey: string;
}

interface PasswordHash {
    hash: string;
    salt: string;
}

class CryptoUtil {
    static generateHash(data: string, algorithm: string = 'sha256'): string {
        if (!data) throw new Error('Data is required for hashing');
        return crypto.createHash(algorithm).update(String(data)).digest('hex');
    }

    static sha256(data: string): string {
        return this.generateHash(data, 'sha256');
    }

    static sha512(data: string): string {
        return this.generateHash(data, 'sha512');
    }

    static hashObject(obj: object, algorithm: string = 'sha256'): string {
        const jsonString = JSON.stringify(obj, Object.keys(obj).sort());
        return this.generateHash(jsonString, algorithm);
    }

    static generateHMAC(data: string, secret: string | null = null, algorithm: string = 'sha256'): string {
        if (!data) throw new Error('Data is required for HMAC');
        const key = secret || process.env.HMAC_SECRET;
        if (!key) throw new Error('Secret key is required for HMAC');
        return crypto.createHmac(algorithm, key).update(String(data)).digest('hex');
    }

    static verifyHMAC(data: string, hmac: string, secret: string | null = null, algorithm: string = 'sha256'): boolean {
        try {
            if (!data || !hmac) return false;
            const computedHmac = this.generateHMAC(data, secret, algorithm);
            return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(computedHmac, 'hex'));
        } catch {
            return false;
        }
    }

    static encrypt(data: string, key: string | null = null): EncryptResult {
        if (!data) throw new Error('Data is required for encryption');
        const encKey = key ? Buffer.from(key, 'hex') : Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
        let encrypted = cipher.update(String(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            algorithm: 'aes-256-gcm',
        };
    }

    static decrypt(encryptedData: string, iv: string, authTag: string, key: string | null = null): string {
        if (!encryptedData || !iv || !authTag) {
            throw new Error('Encrypted data, IV, and auth tag are required');
        }
        const decKey = key ? Buffer.from(key, 'hex') : Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', decKey, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    static generateRandomToken(bytes: number = 32): string {
        return crypto.randomBytes(bytes).toString('hex');
    }

    static async generateRandomTokenAsync(bytes: number = 32): Promise<string> {
        const buffer = await randomBytesAsync(bytes);
        return buffer.toString('hex');
    }

    static generateOTP(length: number = 6): string {
        const digits = '0123456789';
        let otp = '';
        const bytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            otp += digits[bytes[i] % digits.length];
        }
        return otp;
    }

    static async generateKeyPair(userId: string | null = null): Promise<KeyPair> {
        const key = crypto.randomBytes(32).toString('hex');
        const iv = crypto.randomBytes(16).toString('hex');
        const keyId = `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        return { keyId, key, iv };
    }

    static async deriveKeyPBKDF2(
        password: string,
        salt: string | null = null,
        iterations: number = 100000,
        keyLength: number = 32
    ): Promise<DerivedKey> {
        const saltBuffer = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(16);
        const key = (await pbkdf2Async(password, saltBuffer, iterations, keyLength, 'sha512')) as Buffer;
        return {
            key: key.toString('hex'),
            salt: saltBuffer.toString('hex'),
            iterations,
        };
    }

    static generateRSAKeyPair(): RSAKeyPair {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        return { publicKey, privateKey };
    }

    static signData(data: string, privateKey: string): string {
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(String(data));
        sign.end();
        return sign.sign(privateKey, 'base64');
    }

    static verifySignature(data: string, signature: string, publicKey: string): boolean {
        try {
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(String(data));
            verify.end();
            return verify.verify(publicKey, signature, 'base64');
        } catch {
            return false;
        }
    }

    static timingSafeEqual(a: string, b: string): boolean {
        try {
            if (!a || !b || a.length !== b.length) return false;
            return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
        } catch {
            return false;
        }
    }

    static generateUUID(): string {
        return crypto.randomUUID();
    }

    static hashPassword(password: string, salt: string | null = null): PasswordHash {
        const saltToUse = salt || crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, saltToUse, 100000, 64, 'sha512').toString('hex');
        return { hash, salt: saltToUse };
    }

    static verifyPassword(password: string, hash: string, salt: string): boolean {
        const { hash: computedHash } = this.hashPassword(password, salt);
        return this.timingSafeEqual(hash, computedHash);
    }
}

export default CryptoUtil;