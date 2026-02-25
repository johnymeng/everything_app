import { DailyPhotoMeta } from "../models";
import { PostgresRepository } from "../db/postgresRepository";

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

export class PhotoService {
  constructor(private readonly repository: PostgresRepository) {}

  async upsertDailyPhoto(
    userId: string,
    input: { date: string; takenAt: string; contentType: string; imageBase64: string; caption?: string }
  ): Promise<DailyPhotoMeta> {
    const bytes = decodeBase64(input.imageBase64);
    const maxBytes = 5 * 1024 * 1024;
    if (bytes.byteLength === 0) {
      throw new Error("Empty image payload.");
    }
    if (bytes.byteLength > maxBytes) {
      throw new Error("Image too large. Try a smaller photo (max 5MB).");
    }

    const contentType = String(input.contentType || "").trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
      throw new Error("Unsupported image type. Use JPEG, PNG, or WebP.");
    }

    return this.repository.upsertDailyPhoto({
      userId,
      date: input.date,
      takenAt: input.takenAt,
      contentType,
      caption: input.caption,
      image: bytes
    });
  }

  async listDailyPhotos(userId: string, input: { from: string; to: string; limit?: number }): Promise<DailyPhotoMeta[]> {
    return this.repository.listDailyPhotos({ userId, ...input });
  }

  async getDailyPhotoForDate(userId: string, date: string): Promise<DailyPhotoMeta | null> {
    return this.repository.getDailyPhotoForDate(userId, date);
  }

  async getDailyPhotoImage(userId: string, photoId: string): Promise<{ contentType: string; image: Buffer } | null> {
    return this.repository.getDailyPhotoImage(userId, photoId);
  }

  async deleteDailyPhotoForDate(userId: string, date: string): Promise<boolean> {
    return this.repository.deleteDailyPhotoForDate(userId, date);
  }
}

