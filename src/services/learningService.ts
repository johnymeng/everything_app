import {
  LearningDashboardSummary,
  LearningInterestArea,
  LearningPreference,
  LearningProgress,
  LearningSuggestion
} from "../models";
import { PostgresRepository } from "../db/postgresRepository";
import { fallbackDefaultArea, getLearningTopic, listLearningTopics } from "./learningCatalog";

const reviewIntervalsDays = [1, 3, 7, 14, 30, 60, 120];

type ReviewRating = "again" | "hard" | "good" | "easy";

function addDaysIso(from: Date, days: number): string {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + ms).toISOString();
}

function clampStage(stage: number): number {
  if (!Number.isFinite(stage) || stage < 0) return 0;
  return Math.min(stage, reviewIntervalsDays.length - 1);
}

function nextStageFromRating(stage: number, rating: ReviewRating): number {
  const safe = clampStage(stage);
  if (rating === "again") return 0;
  if (rating === "hard") return safe;
  if (rating === "easy") return clampStage(safe + 2);
  return clampStage(safe + 1);
}

function nextReviewDays(stage: number, rating: ReviewRating): number {
  const nextStage = nextStageFromRating(stage, rating);
  const base = reviewIntervalsDays[nextStage] ?? 1;
  if (rating === "hard") {
    return Math.max(1, Math.round(base * 0.75));
  }
  return base;
}

function ratingIsSuccess(rating: ReviewRating): boolean {
  return rating === "good" || rating === "easy";
}

export class LearningService {
  constructor(private readonly repository: PostgresRepository) {}

  async getPreference(userId: string): Promise<LearningPreference> {
    const existing = await this.repository.getLearningPreference(userId);
    if (existing) {
      return existing;
    }

    return this.repository.upsertLearningPreference(userId, fallbackDefaultArea());
  }

  async setPreference(userId: string, interestArea: LearningInterestArea): Promise<LearningPreference> {
    return this.repository.upsertLearningPreference(userId, interestArea);
  }

  async getSuggestion(userId: string): Promise<LearningSuggestion> {
    const preference = await this.getPreference(userId);
    const area = preference.interestArea;
    const topics = listLearningTopics(area);

    if (topics.length === 0) {
      throw new Error(`No learning topics available for area '${area}'.`);
    }

    const learnedKeys = new Set(await this.repository.listLearningTopicKeys(userId, area));
    const unseen = topics.filter((topic) => !learnedKeys.has(topic.key));

    if (unseen.length > 0) {
      return { kind: "new", topic: unseen[0] };
    }

    const due = await this.repository.listDueLearningReviews(userId, 1);
    if (due.length > 0) {
      const topic = getLearningTopic(due[0].topicKey);
      if (topic) {
        return { kind: "review", topic };
      }
    }

    return { kind: "review", topic: topics[0] };
  }

  async getDashboardSummary(userId: string): Promise<LearningDashboardSummary> {
    const preference = await this.getPreference(userId);
    const [suggestion, due, recent] = await Promise.all([
      this.getSuggestion(userId),
      this.repository.listDueLearningReviews(userId, 25),
      this.repository.listRecentLearningProgress(userId, 5)
    ]);

    return {
      preference,
      suggestion,
      dueCount: due.length,
      nextDueAt: due[0]?.nextReviewAt,
      recent
    };
  }

  getTopicOrThrow(topicKey: string) {
    const topic = getLearningTopic(topicKey);
    if (!topic) {
      throw new Error("Unknown topic.");
    }
    return topic;
  }

  async completeTopic(userId: string, topicKey: string): Promise<LearningProgress> {
    const topic = this.getTopicOrThrow(topicKey);
    const now = new Date();
    const nextReviewAt = addDaysIso(now, reviewIntervalsDays[0] ?? 1);
    return this.repository.upsertLearningCompletion({
      userId,
      topicKey: topic.key,
      interestArea: topic.interestArea,
      learnedAt: now.toISOString(),
      nextReviewAt
    });
  }

  async listDue(userId: string, limit = 25): Promise<LearningProgress[]> {
    await this.getPreference(userId);
    return this.repository.listDueLearningReviews(userId, limit);
  }

  async reviewTopic(userId: string, topicKey: string, rating: ReviewRating): Promise<LearningProgress> {
    const progress = await this.repository.getLearningProgress(userId, topicKey);
    if (!progress) {
      throw new Error("Topic not found in your learning history yet. Mark it as learned first.");
    }

    const now = new Date();
    const nextStage = nextStageFromRating(progress.reviewStage, rating);
    const days = nextReviewDays(progress.reviewStage, rating);
    const nextReviewAt = addDaysIso(now, days);
    const correctStreak = ratingIsSuccess(rating) ? progress.correctStreak + 1 : 0;

    return this.repository.updateLearningReview({
      userId,
      topicKey,
      reviewStage: nextStage,
      nextReviewAt,
      lastReviewedAt: now.toISOString(),
      correctStreak
    });
  }
}
