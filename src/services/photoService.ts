import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DailyPhotoMeta } from "../models";
import { PostgresRepository } from "../db/postgresRepository";

const execFileAsync = promisify(execFile);

function detectImageTypeFromBytes(
  input: Buffer
): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "video/mp4" | "video/quicktime" | null {
  if (input.byteLength >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    input.byteLength >= 8 &&
    input[0] === 0x89 &&
    input[1] === 0x50 &&
    input[2] === 0x4e &&
    input[3] === 0x47 &&
    input[4] === 0x0d &&
    input[5] === 0x0a &&
    input[6] === 0x1a &&
    input[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    input.byteLength >= 12 &&
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  if (input.byteLength >= 12 && input.toString("ascii", 4, 8) === "ftyp") {
    const majorBrand = input.toString("ascii", 8, 12).toLowerCase();
    const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"]);
    const mp4Brands = new Set(["isom", "iso2", "mp41", "mp42", "avc1", "hvc1", "hev1", "mmp4", "dash", "msnv", "3gp4", "3gp5", "m4v ", "f4v "]);
    const movBrands = new Set(["qt  "]);
    if (heicBrands.has(majorBrand)) {
      return "image/heic";
    }
    if (movBrands.has(majorBrand)) {
      return "video/quicktime";
    }
    if (mp4Brands.has(majorBrand)) {
      return "video/mp4";
    }

    for (let offset = 16; offset + 4 <= input.byteLength && offset < 48; offset += 4) {
      const brand = input.toString("ascii", offset, offset + 4).toLowerCase();
      if (heicBrands.has(brand)) {
        return "image/heic";
      }
      if (movBrands.has(brand)) {
        return "video/quicktime";
      }
      if (mp4Brands.has(brand)) {
        return "video/mp4";
      }
    }
  }

  return null;
}

function decodeBase64(input: string): Buffer {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Missing image data.");
  }

  const match = trimmed.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  const base64 = match ? match[2] : trimmed;

  try {
    return Buffer.from(base64, "base64");
  } catch (_error) {
    throw new Error("Invalid base64 image data.");
  }
}

async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  if (process.platform !== "darwin") {
    throw new Error("HEIC imports are only supported on macOS right now. Convert to JPEG or PNG first.");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "everything-heic-"));
  const inputPath = path.join(tempDir, "source.heic");
  const outputPath = path.join(tempDir, "output.jpeg");

  try {
    await fs.writeFile(inputPath, input);
    await execFileAsync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", inputPath, "--out", outputPath]);
    const converted = await fs.readFile(outputPath);
    if (converted.byteLength === 0) {
      throw new Error("HEIC conversion produced an empty image.");
    }
    return converted;
  } catch (_error) {
    throw new Error("Failed to convert HEIC image. Try exporting the photo as JPEG/PNG and importing that file.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export class PhotoService {
  constructor(private readonly repository: PostgresRepository) {}

  private async normalizeImagePayload(
    input: { contentType: string; imageBase64: string },
    limits: { maxNativeBytes: number; maxHeicBytes: number; maxOutputBytes: number; maxVideoBytes?: number },
    options?: { allowVideo?: boolean }
  ): Promise<{ contentType: string; image: Buffer }> {
    const bytes = decodeBase64(input.imageBase64);
    if (bytes.byteLength === 0) {
      throw new Error("Empty image payload.");
    }

    const contentType = String(input.contentType || "").trim().toLowerCase();
    const detectedType = detectImageTypeFromBytes(bytes);
    const isGenericType = contentType === "" || contentType === "application/octet-stream" || contentType === "binary/octet-stream";
    const normalizedType = isGenericType && detectedType ? detectedType : contentType || detectedType || "";
    const isNativeWebImage = /^image\/(jpeg|png|webp)$/.test(normalizedType);
    const isHeicByType = /^image\/(heic|heif)(-sequence)?$/.test(normalizedType);
    const isHeic = isHeicByType || detectedType === "image/heic";
    const isVideo = /^video\/(mp4|quicktime)$/.test(normalizedType);

    if (!isNativeWebImage && !isHeic && !isVideo) {
      throw new Error("Unsupported file type. Use JPEG, PNG, WebP, HEIC, MP4, or MOV.");
    }

    if (isVideo && !options?.allowVideo) {
      throw new Error("This endpoint only supports images.");
    }

    if (isVideo) {
      const maxVideoBytes = limits.maxVideoBytes ?? 25 * 1024 * 1024;
      if (bytes.byteLength > maxVideoBytes) {
        const maxMb = Math.max(1, Math.round(maxVideoBytes / (1024 * 1024)));
        throw new Error(`Video too large. Max ${maxMb}MB for MP4/MOV.`);
      }

      return {
        contentType: normalizedType === "video/quicktime" ? "video/quicktime" : "video/mp4",
        image: bytes
      };
    }

    if (bytes.byteLength > (isHeic ? limits.maxHeicBytes : limits.maxNativeBytes)) {
      const maxBytes = isHeic ? limits.maxHeicBytes : limits.maxNativeBytes;
      const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
      throw new Error(`Image too large. Try a smaller photo (max ${maxMb}MB).`);
    }

    let storedImage = bytes;
    let storedContentType = isNativeWebImage ? normalizedType : "image/jpeg";
    if (isHeic) {
      storedImage = await convertHeicToJpeg(bytes);
      storedContentType = "image/jpeg";
    }

    if (storedImage.byteLength > limits.maxOutputBytes) {
      throw new Error("Image too large after processing. Try a smaller photo.");
    }

    return {
      contentType: storedContentType,
      image: storedImage
    };
  }

  async createDailyPhoto(
    userId: string,
    input: { date: string; takenAt: string; contentType: string; imageBase64: string; caption?: string }
  ): Promise<DailyPhotoMeta> {
    const normalized = await this.normalizeImagePayload(input, {
      maxNativeBytes: 5 * 1024 * 1024,
      maxHeicBytes: 7 * 1024 * 1024,
      maxOutputBytes: 5 * 1024 * 1024,
      maxVideoBytes: 25 * 1024 * 1024
    }, {
      allowVideo: true
    });

    return this.repository.createDailyPhoto({
      userId,
      date: input.date,
      takenAt: input.takenAt,
      contentType: normalized.contentType,
      caption: input.caption,
      image: normalized.image
    });
  }

  async normalizeUploadedImage(input: { contentType: string; imageBase64: string }): Promise<{ contentType: string; imageBase64: string }> {
    const normalized = await this.normalizeImagePayload(input, {
      maxNativeBytes: 20 * 1024 * 1024,
      maxHeicBytes: 20 * 1024 * 1024,
      maxOutputBytes: 20 * 1024 * 1024
    });

    return {
      contentType: normalized.contentType,
      imageBase64: normalized.image.toString("base64")
    };
  }

  async listDailyPhotos(userId: string, input: { from: string; to: string; limit?: number }): Promise<DailyPhotoMeta[]> {
    return this.repository.listDailyPhotos({ userId, ...input });
  }

  async getDailyPhotosForDate(userId: string, date: string): Promise<DailyPhotoMeta[]> {
    return this.repository.getDailyPhotosForDate(userId, date);
  }

  async getDailyPhotoImage(userId: string, photoId: string): Promise<{ contentType: string; image: Buffer } | null> {
    return this.repository.getDailyPhotoImage(userId, photoId);
  }

  async deleteDailyPhoto(userId: string, photoId: string): Promise<boolean> {
    return this.repository.deleteDailyPhoto(userId, photoId);
  }

  async deleteDailyPhotoForDate(userId: string, date: string): Promise<boolean> {
    return this.repository.deleteDailyPhotoForDate(userId, date);
  }
}
