/**
 * Simple encryption/decryption utilities for API key storage
 * Uses AES-GCM with a static key for client-side encryption
 */

// Static secret key for encryption (in real applications, this could be derived from user session or other factors)
const SECRET_KEY = 'duckdb-wasm-api-key-secret-2024-x7kP9mN2qR8sT5vY';

/**
 * Derives an encryption key from the secret string
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'PBKDF2' }, false, [
        'deriveBits',
        'deriveKey',
    ]);

    const salt = encoder.encode('duckdb-salt'); // Static salt for consistency

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a string using AES-GCM
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
    try {
        const encoder = new TextEncoder();
        const key = await deriveKey(SECRET_KEY);

        // Generate a random IV
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt the plaintext
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv,
            },
            key,
            encoder.encode(plaintext)
        );

        // Combine IV and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Convert to base64 for storage
        return btoa(String.fromCharCode(...combined));
    } catch (error) {
        console.error('Encryption failed:', error);
        throw new Error('Failed to encrypt API key');
    }
}

/**
 * Decrypts a string using AES-GCM
 */
export async function decryptApiKey(encryptedData: string): Promise<string> {
    try {
        const key = await deriveKey(SECRET_KEY);

        // Convert from base64
        const combined = new Uint8Array(
            atob(encryptedData)
                .split('')
                .map(char => char.charCodeAt(0))
        );

        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        // Decrypt the data
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
            },
            key,
            encrypted
        );

        // Convert back to string
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (error) {
        console.error('Decryption failed:', error);
        throw new Error('Failed to decrypt API key');
    }
}

/**
 * Safely stores an encrypted API key in localStorage
 * If apiKey is empty, removes the key from localStorage
 */
export async function storeEncryptedApiKey(apiKey: string): Promise<void> {
    try {
        if (!apiKey) {
            // Empty string means remove the key
            localStorage.removeItem('anthropic_api_key_encrypted');
            localStorage.removeItem('anthropic_api_key'); // Also clear old unencrypted key if it exists
            return;
        }
        const encrypted = await encryptApiKey(apiKey);
        localStorage.setItem('anthropic_api_key_encrypted', encrypted);
    } catch (error) {
        console.error('Failed to store encrypted API key:', error);
        throw error;
    }
}

/**
 * Safely retrieves and decrypts an API key from localStorage
 */
export async function retrieveEncryptedApiKey(): Promise<string | null> {
    try {
        const encrypted = localStorage.getItem('anthropic_api_key_encrypted');
        if (!encrypted) {
            return null;
        }

        return await decryptApiKey(encrypted);
    } catch (error) {
        console.error('Failed to retrieve encrypted API key:', error);
        // Clear corrupted data
        localStorage.removeItem('anthropic_api_key_encrypted');
        return null;
    }
}

/**
 * Removes the encrypted API key from localStorage
 */
export function clearEncryptedApiKey(): void {
    localStorage.removeItem('anthropic_api_key_encrypted');
    // Also clear old unencrypted key if it exists
    localStorage.removeItem('anthropic_api_key');
}
