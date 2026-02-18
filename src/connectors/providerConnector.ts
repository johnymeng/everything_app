import { Provider } from "../models";
import { getMockPayload } from "./mockData";
import { ConnectResult, ProviderConnector, SyncPayload } from "./types";

interface ConnectorConfig {
  provider: Provider;
  mode: string;
  displayName: string;
  notes: string;
}

export class BankingConnector implements ProviderConnector {
  readonly provider: Provider;
  readonly displayName: string;
  readonly mode: string;

  constructor(private readonly config: ConnectorConfig) {
    this.provider = config.provider;
    this.displayName = config.displayName;
    this.mode = config.mode;
  }

  async connect(userId: string): Promise<ConnectResult> {
    if (this.config.mode !== "mock") {
      return {
        displayName: this.config.displayName,
        metadata: {
          mode: this.config.mode,
          userId,
          integrationState: "pending_configuration",
          notes: this.config.notes
        }
      };
    }

    return {
      displayName: this.config.displayName,
      metadata: {
        mode: "mock",
        userId,
        integrationState: "sandbox_ready"
      }
    };
  }

  async sync(_connectionId: string, _userId: string): Promise<SyncPayload> {
    if (this.config.mode !== "mock") {
      throw new Error(
        `Provider ${this.config.provider} is set to mode=${this.config.mode}. Add your API integration in src/connectors/providerConnector.ts to enable live sync.`
      );
    }

    return getMockPayload(this.config.provider);
  }
}
