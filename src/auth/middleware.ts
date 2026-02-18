import { NextFunction, Request, Response } from "express";
import { AuthService } from "./authService";
import { User } from "../models";

export interface AuthenticatedRequest extends Request {
  user: User;
}

export function createAuthMiddleware(authService: AuthService) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const authorization = request.header("authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
      response.status(401).json({ error: "Missing bearer token." });
      return;
    }

    const token = authorization.slice("Bearer ".length).trim();

    try {
      const user = await authService.verifyToken(token);
      (request as AuthenticatedRequest).user = user;
      next();
    } catch (error) {
      response.status(401).json({ error: error instanceof Error ? error.message : "Unauthorized" });
    }
  };
}
