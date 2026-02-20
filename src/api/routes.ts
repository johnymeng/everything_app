import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { fitnessMetrics } from "../models";
import { AuthService } from "../auth/authService";
import { AuthenticatedRequest, createAuthMiddleware } from "../auth/middleware";
import { FinanceService } from "../services/financeService";
import { FitnessService } from "../services/fitnessService";

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

const fitnessMetricSchema = z.enum(fitnessMetrics);

const appleHealthSyncSchema = z.object({
  samples: z
    .array(
      z.object({
        metric: fitnessMetricSchema,
        value: z.number().finite(),
        unit: z.string().min(1).max(24).optional(),
        recordedAt: z.string().datetime().optional()
      })
    )
    .optional()
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

  return router;
}
