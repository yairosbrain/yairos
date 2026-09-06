// Real cryptography, via the browser's Web Crypto API — nothing here is
// simulated. Passphrases are stretched with PBKDF2-SHA256 and never stored;
// file contents are sealed with AES-256-GCM, which is authenticated, so a
// tampered ciphertext fails to decrypt rather than returning garbage.

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96 bits, the size GCM is specified for

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveBits(
  passphrase: string,
  salt: Uint8Array,
  bits: number
): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    bits
  );
}

/* ---------------- Passphrase verification ---------------- */

export interface StoredPassphrase {
  salt: string;
  hash: string;
  iterations: number;
}

/** Derive a verifier for a passphrase. The passphrase itself is never kept. */
export async function hashPassphrase(passphrase: string): Promise<StoredPassphrase> {
  const salt = randomBytes(SALT_BYTES);
  const bits = await deriveBits(passphrase, salt, 256);
  return {
    salt: toB64(salt),
    hash: toB64(new Uint8Array(bits)),
    iterations: PBKDF2_ITERATIONS
  };
}

/** Constant-time-ish comparison of the derived verifier */
export async function verifyPassphrase(
  passphrase: string,
  stored: StoredPassphrase
): Promise<boolean> {
  const bits = await deriveBits(passphrase, fromB64(stored.salt), 256);
  const a = new Uint8Array(bits);
  const b = fromB64(stored.hash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------------- File encryption ---------------- */

/** Sealed blob layout: yairos-aes256gcm:<salt>:<iv>:<ciphertext>, all base64 */
const ENVELOPE = "yairos-aes256gcm";

export function isEncrypted(text: string): boolean {
  return text.startsWith(`${ENVELOPE}:`);
}

async function aesKey(
  passphrase: string,
  salt: Uint8Array,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const bits = await deriveBits(passphrase, salt, 256);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, usage);
}

export async function encryptText(
  plaintext: string,
  passphrase: string
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await aesKey(passphrase, salt, ["encrypt"]);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext)
  );
  return [ENVELOPE, toB64(salt), toB64(iv), toB64(new Uint8Array(sealed))].join(":");
}

/** Throws when the passphrase is wrong OR the blob was tampered with */
export async function decryptText(
  blob: string,
  passphrase: string
): Promise<string> {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== ENVELOPE) {
    throw new Error("not a yairos sealed blob");
  }
  const [, saltB64, ivB64, dataB64] = parts;
  const key = await aesKey(passphrase, fromB64(saltB64), ["decrypt"]);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) as BufferSource },
    key,
    fromB64(dataB64) as BufferSource
  );
  return dec.decode(opened);
}

/* ---------------- Digests ---------------- */

export async function digest(
  text: string,
  algo: "SHA-256" | "SHA-1" | "SHA-512" = "SHA-256"
): Promise<string> {
  const buf = await crypto.subtle.digest(algo, enc.encode(text));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
