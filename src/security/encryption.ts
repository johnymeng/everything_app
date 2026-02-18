import crypto from "node:crypto";

const IV_LENGTH = 12;

function deriveKey(seed: string): Buffer {
  return crypto.createHash("sha256").update(seed, "utf8").digest();
}

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY ?? "dev-encryption-key-change-me";
  return deriveKey(raw);
}

export function encryptString(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptString(payload: string): string {
  const key = getKey();
  const [ivB64, authTagB64, encryptedB64] = payload.split(":");

  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted payload format.");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString("utf8");
}
