import crypto from "node:crypto";
import { z } from "zod";
import { Habit, HabitLogEntry } from "../models";
import { PostgresRepository } from "../db/postgresRepository";

export const habitColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #18d18c.");

export const habitDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

const DEFAULT_HABITS: Array<{ name: string; color: string }> = [
  { name: "Gym", color: "#18d18c" },
  { name: "Stretch", color: "#7c5cff" },
  { name: "LeetCode", color: "#ffb020" },
  { name: "Read", color: "#60a5fa" }
];

export class HabitService {
  constructor(private readonly repository: PostgresRepository) {}

  private async ensureDefaults(userId: string): Promise<void> {
    await this.repository.withTransaction(async (client) => {
      const existing = await client.query(`SELECT 1 FROM habits WHERE user_id = $1 LIMIT 1`, [userId]);
      if ((existing.rowCount ?? 0) > 0) {
        return;
      }

      let sortOrder = 0;
      for (const habit of DEFAULT_HABITS) {
        await client.query(
          `INSERT INTO habits (id, user_id, name, color, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, name) DO NOTHING`,
          [crypto.randomUUID(), userId, habit.name, habit.color, sortOrder]
        );
        sortOrder += 1;
      }
    });
  }

  async listHabits(userId: string): Promise<Habit[]> {
    await this.ensureDefaults(userId);
    return await this.repository.listHabits(userId);
  }

  async createHabit(userId: string, input: { name: string; color?: string }): Promise<Habit> {
    const name = z.string().trim().min(1).max(60).parse(input.name);
    const color = input.color ? habitColorSchema.parse(input.color) : "#18d18c";
    return await this.repository.createHabit(userId, { name, color });
  }

  async updateHabit(
    userId: string,
    habitId: string,
    patch: { name?: string; color?: string; sortOrder?: number; archived?: boolean }
  ): Promise<Habit | null> {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        color: habitColorSchema.optional(),
        sortOrder: z.number().int().min(0).max(100000).optional(),
        archived: z.boolean().optional()
      })
      .parse(patch);

    return await this.repository.updateHabit(userId, habitId, parsed);
  }

  async listLogs(userId: string, input: { from: string; to: string }): Promise<HabitLogEntry[]> {
    const from = habitDateSchema.parse(input.from);
    const to = habitDateSchema.parse(input.to);
    return await this.repository.listHabitLogs(userId, { from, to });
  }

  async upsertLogsForDate(
    userId: string,
    date: string,
    entries: Array<{ habitId: string; completed: boolean; note?: string }>
  ): Promise<HabitLogEntry[]> {
    const parsedDate = habitDateSchema.parse(date);
    const parsedEntries = z
      .array(
        z.object({
          habitId: z.string().uuid(),
          completed: z.boolean(),
          note: z.string().trim().max(500).optional()
        })
      )
      .max(200)
      .parse(entries ?? []);

    if (parsedEntries.length === 0) {
      return [];
    }

    return await this.repository.upsertHabitLogsForDate(userId, {
      date: parsedDate,
      entries: parsedEntries
    });
  }
}
