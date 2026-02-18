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

async function bootstrap(): Promise<void> {
  const repository = new PostgresRepository(config.databaseUrl);
  await repository.initialize();

  const authService = new AuthService(repository);
  const financeService = new FinanceService(repository);
  const fitnessService = new FitnessService(repository);

  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(morgan("dev"));

  app.use("/api", createApiRouter(financeService, fitnessService, authService));

  const publicPath = path.resolve(process.cwd(), "public");
  app.use(express.static(publicPath));

  app.get("*", (_request, response) => {
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
