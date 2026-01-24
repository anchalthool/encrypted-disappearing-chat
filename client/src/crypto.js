// Convert between base64 and Uint8Array
function bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }
  
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  
  // Derive AES-GCM key from a passphrase + salt (salt should be stable per group)
  export async function deriveKeyFromPassphrase(passphrase, saltBase64) {
    const enc = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
  
    const salt = base64ToBytes(saltBase64);
  
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 150000,
        hash: "SHA-256",
      },
      passphraseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  
  // For now we'll use a **fixed salt per group** just to keep things simple in v1.
  // You can later store a random salt per group in DB.
  export function getSaltForGroup(groupId) {
    // crude deterministic "salt": take first 16 chars of groupId and base64 it
    const str = groupId.slice(0, 16);
    const bytes = new TextEncoder().encode(str);
    return bytesToBase64(bytes);
  }
  
  export async function encryptMessage(plainText, aesKey) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
  
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      enc.encode(plainText)
    );
  
    return {
      ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
      iv: bytesToBase64(iv),
    };
  }
  
  export async function decryptMessage(ciphertextB64, ivB64, aesKey) {
    try {
      const dec = new TextDecoder();
      const cipherBytes = base64ToBytes(ciphertextB64);
      const iv = base64ToBytes(ivB64);
  
      const plainBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        cipherBytes
      );
  
      return dec.decode(plainBuffer);
    } catch (err) {
      // If someone sent dummy test data or wrong key
      return "[cannot decrypt]";
    }
  }
  