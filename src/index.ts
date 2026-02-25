import path from "node:path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { config } from "./config";
import { createApiRouter } from "./api/routes";
import { AuthService } from "./auth/authService";
import { PostgresRepository } from "./db/postgresRepository";
import { FinanceService } from "./services/financeService";
import { FitnessService } from "./services/fitnessService";
import { HabitService } from "./services/habitService";
import { LearningService } from "./services/learningService";
import { PhotoService } from "./services/photoService";

async function bootstrap(): Promise<void> {
  const repository = new PostgresRepository(config.databaseUrl);
  await repository.initialize();

  const authService = new AuthService(repository);
  const financeService = new FinanceService(repository);
  const fitnessService = new FitnessService(repository);
  const habitService = new HabitService(repository);
  const learningService = new LearningService(repository);
  const photoService = new PhotoService(repository);

  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("dev"));

  app.use("/api", createApiRouter(financeService, fitnessService, habitService, learningService, photoService, authService));
  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API route not found" });
  });

  const publicPath = path.resolve(process.cwd(), "public");
  app.use(express.static(publicPath));

  app.get(/^\/(?!api\/).*/, (_request, response) => {
    response.sendFile(path.join(publicPath, "index.html"));
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof Error && error.name === "ZodError") {
      return response.status(400).json({
        error: "Invalid request",
        details: error.message
      });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error";
    return response.status(500).json({ error: message });
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`${config.appName} listening on http://localhost:${config.port}`);
  });

  const intervalMinutes = config.jobs.autoSyncIntervalMinutes;
  if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) {
    let running = false;

    const runAutoSync = async () => {
      if (running) {
        return;
      }

      running = true;

      try {
        const userIds = await repository.listUserIds();
        for (const userId of userIds) {
          await financeService.syncAllConnections(userId);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Auto sync failed", error);
      } finally {
        running = false;
      }
    };

    // Run soon after startup, then on a fixed interval.
    setTimeout(runAutoSync, 2000);
    setInterval(runAutoSync, intervalMinutes * 60 * 1000);
  }

  process.on("SIGINT", async () => {
    await repository.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await repository.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
