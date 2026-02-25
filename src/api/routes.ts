import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { fitnessMetrics, learningInterestAreas } from "../models";
import { AuthService } from "../auth/authService";
import { AuthenticatedRequest, createAuthMiddleware } from "../auth/middleware";
import { FinanceService } from "../services/financeService";
import { FitnessService } from "../services/fitnessService";
import { HabitService } from "../services/habitService";
import { LearningService } from "../services/learningService";
import { PhotoService } from "../services/photoService";

const connectableProviders = ["eq_bank", "wealthsimple", "td", "amex"] as const;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1).max(120).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const providerParamSchema = z.object({
  provider: z.enum(connectableProviders)
});

const exchangeSchema = z.object({
  publicToken: z.string().min(1)
});

const transactionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

const portfolioMetricSchema = z.enum(["investments", "netWorth", "totalAssets"]);
const portfolioRangeSchema = z.enum(["1d", "1m", "3m", "6m", "1y", "5y"]);

const portfolioHistoryQuerySchema = z.object({
  metric: portfolioMetricSchema.optional(),
  range: portfolioRangeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  maxPoints: z.coerce.number().int().min(25).max(2000).optional()
});

const portfolioSnapshotsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

const portfolioSnapshotParamSchema = z.object({
  snapshotId: z.string().uuid()
});

const fitnessMetricSchema = z.enum(fitnessMetrics);

const appleHealthSyncSchema = z.object({
  samples: z.array(
    z.object({
      metric: fitnessMetricSchema,
      value: z.number().finite(),
      unit: z.string().min(1).max(24).optional(),
      recordedAt: z.string().datetime().optional()
    })
  )
});

const upsertFitnessTargetSchema = z.object({
  metric: fitnessMetricSchema,
  label: z.string().min(1).max(80).optional(),
  targetValue: z.number().finite(),
  unit: z.string().min(1).max(24).optional(),
  dueDate: z.string().date().optional()
});

const addManualFitnessSampleSchema = z.object({
  metric: fitnessMetricSchema,
  value: z.number().finite(),
  unit: z.string().min(1).max(24).optional(),
  recordedAt: z.string().datetime().optional()
});

const habitColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #18d18c.");

const habitDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

const habitCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: habitColorSchema.optional()
});

const habitIdParamSchema = z.object({
  habitId: z.string().uuid()
});

const habitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: habitColorSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  archived: z.boolean().optional()
});

const habitLogQuerySchema = z.object({
  from: habitDateSchema,
  to: habitDateSchema
});

const habitLogsUpsertSchema = z.object({
  entries: z
    .array(
      z.object({
        habitId: z.string().uuid(),
        completed: z.boolean(),
        note: z.string().trim().max(500).optional()
      })
    )
    .max(200)
});

const photoListQuerySchema = z.object({
  from: habitDateSchema,
  to: habitDateSchema,
  limit: z.coerce.number().int().min(1).max(5000).optional()
});

const photoDateParamSchema = z.object({
  date: habitDateSchema
});

const photoIdParamSchema = z.object({
  photoId: z.string().uuid()
});

const photoUpsertSchema = z.object({
  date: habitDateSchema,
  takenAt: z.string().datetime(),
  contentType: z.string().trim().min(3).max(80),
  imageBase64: z.string().min(1),
  caption: z.string().trim().max(300).optional()
});

const learningInterestAreaSchema = z.enum(learningInterestAreas);

const upsertLearningPreferenceSchema = z.object({
  interestArea: learningInterestAreaSchema
});

const completeLearningTopicSchema = z.object({
  topicKey: z.string().min(1).max(160)
});

const reviewLearningTopicSchema = z.object({
  topicKey: z.string().min(1).max(160),
  rating: z.enum(["again", "hard", "good", "easy"])
});

const accountTypeSchema = z.enum([
  "cash",
  "chequing",
  "savings",
  "investment",
  "credit_card",
  "loan",
  "line_of_credit",
  "mortgage",
  "other"
]);

const csvImportSchema = z.object({
  provider: z.enum(["manual_csv"]).optional(),
  csvText: z.string().min(1),
  institutionName: z.string().min(1).max(120).optional(),
  defaultAccountName: z.string().min(1).max(120).optional(),
  defaultAccountType: accountTypeSchema.optional(),
  defaultCurrency: z
    .string()
    .min(3)
    .max(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  dayFirst: z.boolean().optional()
});

function asyncHandler(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction): void => {
    handler(request, response).catch(next);
  };
}

function currentUserId(request: Request): string {
  return (request as AuthenticatedRequest).user.id;
}

export function createApiRouter(
  financeService: FinanceService,
  fitnessService: FitnessService,
  habitService: HabitService,
  learningService: LearningService,
  photoService: PhotoService,
  authService: AuthService
): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(authService);

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.post(
    "/auth/register",
    asyncHandler(async (request, response) => {
      const body = registerSchema.parse(request.body);
      const result = await authService.register(body.email, body.password, body.name);
      response.status(201).json(result);
    })
  );

  router.post(
    "/auth/login",
    asyncHandler(async (request, response) => {
      const body = loginSchema.parse(request.body);
      const result = await authService.login(body.email, body.password);
      response.json(result);
    })
  );

  router.get(
    "/auth/me",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json((request as AuthenticatedRequest).user);
    })
  );

  router.get(
    "/providers",
    requireAuth,
    asyncHandler(async (_request, response) => {
      response.json(financeService.listProviders());
    })
  );

  router.post(
    "/providers/:provider/link-token",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = providerParamSchema.parse(request.params);
      const result = await financeService.createLinkToken(currentUserId(request), params.provider);
      response.json(result);
    })
  );

  router.post(
    "/providers/:provider/exchange",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = providerParamSchema.parse(request.params);
      const body = exchangeSchema.parse(request.body);
      const connection = await financeService.exchangePublicToken(
        currentUserId(request),
        params.provider,
        body.publicToken
      );

      response.status(201).json(connection);
    })
  );

  router.get(
    "/connections",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.listConnections(currentUserId(request)));
    })
  );

  router.post(
    "/connections/:connectionId/sync",
    requireAuth,
    asyncHandler(async (request, response) => {
      const result = await financeService.syncConnection(currentUserId(request), request.params.connectionId);
      response.json(result);
    })
  );

  router.post(
    "/sync-all",
    requireAuth,
    asyncHandler(async (request, response) => {
      const results = await financeService.syncAllConnections(currentUserId(request));
      response.json({ results });
    })
  );

  router.post(
    "/reset",
    requireAuth,
    asyncHandler(async (request, response) => {
      const result = await financeService.resetUserData(currentUserId(request));
      response.json({ ok: true, deleted: result });
    })
  );

  router.get(
    "/debug/user-counts",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getUserDataCounts(currentUserId(request)));
    })
  );

  router.get(
    "/accounts",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getAccounts(currentUserId(request)));
    })
  );

  router.get(
    "/holdings",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getHoldings(currentUserId(request)));
    })
  );

  router.get(
    "/liabilities",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getLiabilities(currentUserId(request)));
    })
  );

  router.get(
    "/transactions",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = transactionQuerySchema.parse(request.query);
      const limit = query.limit ?? 100;
      response.json(await financeService.getTransactions(currentUserId(request), limit));
    })
  );

  router.get(
    "/summary",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getSummary(currentUserId(request)));
    })
  );

  router.get(
    "/portfolio/history",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = portfolioHistoryQuerySchema.parse(request.query ?? {});
      const metric = query.metric ?? "investments";
      const to = query.to ?? new Date().toISOString();
      const toTime = Date.parse(to);

      if (Number.isNaN(toTime)) {
        throw new Error("Invalid 'to' datetime.");
      }

      const range = query.range ?? "1m";
      const rangeDays = range === "1d" ? 1 : range === "1m" ? 30 : range === "3m" ? 90 : range === "6m" ? 180 : range === "1y" ? 365 : 365 * 5;
      const from = query.from ?? new Date(toTime - rangeDays * 24 * 60 * 60 * 1000).toISOString();

      response.json(
        await financeService.getPortfolioHistory({
          userId: currentUserId(request),
          from,
          to,
          metric,
          maxPoints: query.maxPoints
        })
      );
    })
  );

  router.get(
    "/portfolio/snapshots",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = portfolioSnapshotsQuerySchema.parse(request.query ?? {});
      response.json(
        await financeService.listPortfolioSnapshots({
          userId: currentUserId(request),
          from: query.from,
          to: query.to,
          limit: query.limit
        })
      );
    })
  );

  router.get(
    "/portfolio/snapshots/:snapshotId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = portfolioSnapshotParamSchema.parse(request.params);
      const snapshot = await financeService.getPortfolioSnapshotById(currentUserId(request), params.snapshotId);

      if (!snapshot) {
        response.status(404).json({ error: "Snapshot not found" });
        return;
      }

      response.json(snapshot);
    })
  );

  router.post(
    "/import/csv",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = csvImportSchema.parse(request.body ?? {});
      const result = await financeService.importStatementCsv(currentUserId(request), body);
      response.status(201).json(result);
    })
  );

  router.get(
    "/fitness/metrics",
    requireAuth,
    asyncHandler(async (_request, response) => {
      response.json(fitnessService.listMetricCatalog());
    })
  );

  router.get(
    "/fitness/dashboard",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await fitnessService.getDashboard(currentUserId(request)));
    })
  );

  router.post(
    "/fitness/apple-health/sync",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = appleHealthSyncSchema.parse(request.body ?? {});
      response.json(await fitnessService.syncAppleHealth(currentUserId(request), body.samples));
    })
  );

  router.post(
    "/fitness/samples",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = addManualFitnessSampleSchema.parse(request.body ?? {});
      const created = await fitnessService.addManualSample(currentUserId(request), body);
      response.status(201).json(created);
    })
  );

  router.post(
    "/fitness/targets",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = upsertFitnessTargetSchema.parse(request.body ?? {});
      const target = await fitnessService.upsertTarget(currentUserId(request), body);
      response.status(201).json(target);
    })
  );

  router.delete(
    "/fitness/targets/:targetId",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await fitnessService.deleteTarget(currentUserId(request), request.params.targetId));
    })
  );

  router.get(
    "/habits",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await habitService.listHabits(currentUserId(request)));
    })
  );

  router.post(
    "/habits",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = habitCreateSchema.parse(request.body ?? {});
      const habit = await habitService.createHabit(currentUserId(request), body);
      response.status(201).json(habit);
    })
  );

  router.patch(
    "/habits/:habitId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = habitIdParamSchema.parse(request.params ?? {});
      const body = habitUpdateSchema.parse(request.body ?? {});
      const habit = await habitService.updateHabit(currentUserId(request), params.habitId, body);

      if (!habit) {
        response.status(404).json({ error: "Habit not found" });
        return;
      }

      response.json(habit);
    })
  );

  router.get(
    "/habits/logs",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = habitLogQuerySchema.parse(request.query ?? {});
      response.json(await habitService.listLogs(currentUserId(request), query));
    })
  );

  router.put(
    "/habits/logs/:date",
    requireAuth,
    asyncHandler(async (request, response) => {
      const date = habitDateSchema.parse(request.params.date);
      const body = habitLogsUpsertSchema.parse(request.body ?? {});
      response.json(await habitService.upsertLogsForDate(currentUserId(request), date, body.entries));
    })
  );

  router.get(
    "/photos",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = photoListQuerySchema.parse(request.query ?? {});
      const photos = await photoService.listDailyPhotos(currentUserId(request), query);
      response.json({ photos });
    })
  );

  router.get(
    "/photos/by-date/:date",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = photoDateParamSchema.parse(request.params ?? {});
      const photo = await photoService.getDailyPhotoForDate(currentUserId(request), params.date);
      response.json({ photo });
    })
  );

  router.post(
    "/photos",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = photoUpsertSchema.parse(request.body ?? {});
      const photo = await photoService.upsertDailyPhoto(currentUserId(request), body);
      response.status(201).json({ photo });
    })
  );

  router.get(
    "/photos/:photoId/image",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = photoIdParamSchema.parse(request.params ?? {});
      const result = await photoService.getDailyPhotoImage(currentUserId(request), params.photoId);
      if (!result) {
        response.status(404).json({ error: "Photo not found" });
        return;
      }

      response.setHeader("Content-Type", result.contentType);
      response.setHeader("Cache-Control", "no-store");
      response.end(result.image);
    })
  );

  router.delete(
    "/photos/:date",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = photoDateParamSchema.parse(request.params ?? {});
      const deleted = await photoService.deleteDailyPhotoForDate(currentUserId(request), params.date);
      response.json({ deleted });
    })
  );

  router.get(
    "/learning/dashboard",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await learningService.getDashboardSummary(currentUserId(request)));
    })
  );

  router.get(
    "/learning/preferences",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await learningService.getPreference(currentUserId(request)));
    })
  );

  router.put(
    "/learning/preferences",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = upsertLearningPreferenceSchema.parse(request.body ?? {});
      response.json(await learningService.setPreference(currentUserId(request), body.interestArea));
    })
  );

  router.get(
    "/learning/suggest",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await learningService.getSuggestion(currentUserId(request)));
    })
  );

  router.get(
    "/learning/topics/:topicKey",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(learningService.getTopicOrThrow(request.params.topicKey));
    })
  );

  router.post(
    "/learning/complete",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = completeLearningTopicSchema.parse(request.body ?? {});
      const progress = await learningService.completeTopic(currentUserId(request), body.topicKey);
      response.status(201).json(progress);
    })
  );

  router.get(
    "/learning/reviews/due",
    requireAuth,
    asyncHandler(async (request, response) => {
      const limit = request.query?.limit ? Number(request.query.limit) : 25;
      response.json(await learningService.listDue(currentUserId(request), limit));
    })
  );

  router.post(
    "/learning/reviews",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = reviewLearningTopicSchema.parse(request.body ?? {});
      response.json(await learningService.reviewTopic(currentUserId(request), body.topicKey, body.rating));
    })
  );

  return router;
}
