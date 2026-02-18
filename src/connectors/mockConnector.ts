import { Connection, ConnectionCredential, Provider } from "../models";
import { getMockPayload } from "./mockData";
import { ExchangeResult, LinkTokenResult, ProviderConnector, SyncPayload } from "./types";

export class MockConnector implements ProviderConnector {
  readonly mode = "mock";

  constructor(
    readonly provider: Provider,
    readonly displayName: string
  ) {}

  async createLinkToken(userId: string): Promise<LinkTokenResult> {
    return {
      linkToken: `mock-link-token:${this.provider}:${userId}:${Date.now()}`,
      mode: this.mode
    };
  }

  async exchangePublicToken(_userId: string, publicToken: string): Promise<ExchangeResult> {
    return {
      displayName: this.displayName,
      metadata: {
        mode: this.mode,
        publicTokenSample: publicToken.slice(0, 8)
      },
      credential: {
        accessToken: `mock-access-token:${this.provider}`
      }
    };
  }

  async sync(_connection: Connection, _credential: ConnectionCredential): Promise<SyncPayload> {
    return getMockPayload(this.provider);
  }
}
