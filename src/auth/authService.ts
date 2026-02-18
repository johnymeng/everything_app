import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config";
import { User } from "../models";
import { PostgresRepository } from "../db/postgresRepository";

const PASSWORD_MIN_LENGTH = 12;

export interface AuthResult {
  user: User;
  token: string;
}

interface JwtPayload {
  sub: string;
  email: string;
}

export class AuthService {
  constructor(private readonly repository: PostgresRepository) {}

  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }

    const existing = await this.repository.findUserByEmail(email);

    if (existing) {
      throw new Error("Email is already registered.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.repository.createUser(email, name?.trim() || this.defaultNameFromEmail(email), passwordHash);

    return {
      user,
      token: this.issueToken(user)
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const record = await this.repository.findUserByEmail(email);

    if (!record) {
      throw new Error("Invalid email or password.");
    }

    const isValid = await bcrypt.compare(password, record.passwordHash);

    if (!isValid) {
      throw new Error("Invalid email or password.");
    }

    const user: User = {
      id: record.id,
      email: record.email,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };

    return {
      user,
      token: this.issueToken(user)
    };
  }

  async verifyToken(token: string): Promise<User> {
    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch (_error) {
      throw new Error("Invalid or expired token.");
    }

    const user = await this.repository.findUserById(payload.sub);

    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  }

  private issueToken(user: User): string {
    const expiresIn = config.jwt.expiresIn as SignOptions["expiresIn"];

    return jwt.sign(
      {
        sub: user.id,
        email: user.email
      },
      config.jwt.secret,
      {
        expiresIn
      }
    );
  }

  private defaultNameFromEmail(email: string): string {
    const prefix = email.split("@")[0];

    if (!prefix) {
      return "User";
    }

    return prefix.replace(/[._-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
