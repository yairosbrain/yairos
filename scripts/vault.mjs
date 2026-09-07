#!/usr/bin/env node
// YAIROS vault — encrypt / decrypt a file with the same scheme the in-app
// shell uses (src/os/crypto.ts). AES-256-GCM, key from PBKDF2-SHA256 at
// 600k iterations, random salt + IV per seal. A file sealed here opens in
// the browser shell and vice-versa.
//
//   node scripts/vault.mjs encrypt <file>          -> writes <file>.enc
//   node scripts/vault.mjs decrypt <file.enc>      -> writes <file> (no .enc)
//   node scripts/vault.mjs verifier                -> prints a login verifier
//   node scripts/vault.mjs check <file.enc>        -> passphrase test only
//
// The passphrase is read from the YAIROS_PASS env var, or prompted for
// (hidden) if it is not set. It is never written anywhere.

import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { createInterface } from "node:readline";

const ENVELOPE = "yairos-aes256gcm";
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

async function deriveBits(passphrase, salt, bits) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    bits
  );
}

async function aesKey(passphrase, salt, usage) {
  const bits = await deriveBits(passphrase, salt, 256);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, usage);
}

async function encryptText(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await aesKey(passphrase, salt, ["encrypt"]);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return [ENVELOPE, b64(salt), b64(iv), b64(new Uint8Array(sealed))].join(":");
}

async function decryptText(blob, passphrase) {
  const parts = blob.trim().split(":");
  if (parts.length !== 4 || parts[0] !== ENVELOPE) {
    throw new Error("not a yairos sealed blob");
  }
  const [, saltB64, ivB64, dataB64] = parts;
  const key = await aesKey(passphrase, unb64(saltB64), ["decrypt"]);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivB64) },
    key,
    unb64(dataB64)
  );
  return dec.decode(opened);
}

async function makeVerifier(passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const bits = await deriveBits(passphrase, salt, 256);
  return {
    salt: b64(salt),
    hash: b64(new Uint8Array(bits)),
    iterations: PBKDF2_ITERATIONS
  };
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const onData = (ch) => {
      const s = ch.toString();
      if (s === "\n" || s === "\r" || s === "") return;
      process.stdout.write("\x1b[2K\x1b[200D" + prompt + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(prompt, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function getPass() {
  if (process.env.YAIROS_PASS) return process.env.YAIROS_PASS;
  return askHidden("passphrase: ");
}

const [, , cmd, file] = process.argv;

try {
  if (cmd === "encrypt") {
    if (!file) throw new Error("usage: vault.mjs encrypt <file>");
    const pass = await getPass();
    const out = await encryptText(readFileSync(file, "utf8"), pass);
    const dst = `${file}.enc`;
    writeFileSync(dst, out + "\n");
    console.log(`sealed -> ${dst}  (${out.length} bytes, AES-256-GCM)`);
  } else if (cmd === "decrypt") {
    if (!file) throw new Error("usage: vault.mjs decrypt <file.enc>");
    const pass = await getPass();
    const text = await decryptText(readFileSync(file, "utf8"), pass);
    const dst = file.replace(/\.enc$/, "");
    if (dst === file) throw new Error("input must end in .enc");
    writeFileSync(dst, text);
    console.log(`opened -> ${dst}`);
  } else if (cmd === "check") {
    if (!file) throw new Error("usage: vault.mjs check <file.enc>");
    const pass = await getPass();
    await decryptText(readFileSync(file, "utf8"), pass);
    console.log("passphrase OK");
  } else if (cmd === "verifier") {
    const pass = await getPass();
    console.log(JSON.stringify(await makeVerifier(pass)));
  } else {
    console.log(
      "usage:\n" +
        "  node scripts/vault.mjs encrypt <file>\n" +
        "  node scripts/vault.mjs decrypt <file.enc>\n" +
        "  node scripts/vault.mjs check <file.enc>\n" +
        "  node scripts/vault.mjs verifier\n\n" +
        "passphrase comes from $YAIROS_PASS or a hidden prompt."
    );
    process.exit(1);
  }
} catch (e) {
  console.error(
    cmd === "decrypt" || cmd === "check"
      ? "FAILED: wrong passphrase, or the file was altered"
      : `FAILED: ${e.message}`
  );
  process.exit(1);
}
