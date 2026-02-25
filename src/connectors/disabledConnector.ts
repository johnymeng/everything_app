import { Connection, ConnectionCredential, Provider } from "../models";
import { ExchangeResult, LinkTokenResult, ProviderConnector, SyncPayload } from "./types";

export class DisabledConnector implements ProviderConnector {
  readonly mode = "disabled";

  constructor(
    readonly provider: Provider,
    readonly displayName: string,
    private readonly message: string
  ) {}

  async createLinkToken(_userId: string): Promise<LinkTokenResult> {
    throw new Error(this.message);
  }

  async exchangePublicToken(_userId: string, _publicToken: string): Promise<ExchangeResult> {
    throw new Error(this.message);
  }

  async sync(_connection: Connection, _credential: ConnectionCredential): Promise<SyncPayload> {
    throw new Error(this.message);
  }
}

