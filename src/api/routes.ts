import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { providers } from "../models";
import { FinanceService } from "../services/financeService";

const connectSchema = z.object({
  userId: z.string().min(1).optional(),
  provider: z.enum(providers)
});

const userQuerySchema = z.object({
  userId: z.string().min(1).optional()
});

const transactionQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

export function createApiRouter(financeService: FinanceService): Router {
  const router = Router();
  const asyncHandler =
    (handler: (request: Request, response: Response) => Promise<void>) =>
    (request: Request, response: Response, next: NextFunction): void => {
      handler(request, response).catch(next);
    };

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/providers", (_request, response) => {
    response.json(financeService.listProviders());
  });

  router.get("/connections", (request, response) => {
    const query = userQuerySchema.parse(request.query);
    const userId = query.userId ?? config.defaultUserId;

    response.json(financeService.listConnections(userId));
  });

  router.post(
    "/connections",
    asyncHandler(async (request, response) => {
      const body = connectSchema.parse(request.body);
      const userId = body.userId ?? config.defaultUserId;

      const connection = await financeService.connectProvider(userId, body.provider);
      response.status(201).json(connection);
    })
  );

  router.post(
    "/connections/:connectionId/sync",
    asyncHandler(async (request, response) => {
      const result = await financeService.syncConnection(request.params.connectionId);
      response.json(result);
    })
  );

  router.post(
    "/sync-all",
    asyncHandler(async (request, response) => {
      const body = userQuerySchema.parse(request.body ?? {});
      const userId = body.userId ?? config.defaultUserId;
      const results = await financeService.syncAllConnections(userId);

      response.json({ results });
    })
  );

  router.get("/accounts", (request, response) => {
    const query = userQuerySchema.parse(request.query);
    const userId = query.userId ?? config.defaultUserId;

    response.json(financeService.getAccounts(userId));
  });

  router.get("/holdings", (request, response) => {
    const query = userQuerySchema.parse(request.query);
    const userId = query.userId ?? config.defaultUserId;

    response.json(financeService.getHoldings(userId));
  });

  router.get("/liabilities", (request, response) => {
    const query = userQuerySchema.parse(request.query);
    const userId = query.userId ?? config.defaultUserId;

    response.json(financeService.getLiabilities(userId));
  });

  router.get("/transactions", (request, response) => {
    const query = transactionQuerySchema.parse(request.query);
    const userId = query.userId ?? config.defaultUserId;
    const limit = query.limit ?? 100;

    response.json(financeService.getTransactions(userId, limit));
  });

  router.get("/summary", (request, response) => {
    const query = userQuerySchema.parse(request.query);
    const userId = query.userId ?? config.defaultUserId;

    response.json(financeService.getSummary(userId));
  });

  return router;
}
