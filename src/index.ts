import path from "node:path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { config } from "./config";
import { createApiRouter } from "./api/routes";
import { FinanceService } from "./services/financeService";
import { JsonStore } from "./store";

const app = express();
const store = new JsonStore(config.dataFile);
const financeService = new FinanceService(store);

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/api", createApiRouter(financeService));

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
  response.status(500).json({ error: message });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`${config.appName} listening on http://localhost:${config.port}`);
});
