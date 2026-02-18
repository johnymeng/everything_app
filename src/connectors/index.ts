import { config } from "../config";
import { Provider } from "../models";
import { BankingConnector } from "./providerConnector";
import { ProviderConnector } from "./types";

const connectorList: ProviderConnector[] = [
  new BankingConnector({
    provider: "eq_bank",
    mode: config.integrations.eqBankMode,
    displayName: "EQ Bank",
    notes: "EQ Bank typically requires a data aggregator in Canada; direct public APIs are limited."
  }),
  new BankingConnector({
    provider: "wealthsimple",
    mode: config.integrations.wealthsimpleMode,
    displayName: "Wealthsimple",
    notes: "Wealthsimple access commonly uses partner/portfolio APIs or export ingestion depending on account type."
  }),
  new BankingConnector({
    provider: "td",
    mode: config.integrations.tdMode,
    displayName: "TD Canada Trust",
    notes: "TD integrations are commonly managed via secure open banking connectors."
  }),
  new BankingConnector({
    provider: "amex",
    mode: config.integrations.amexMode,
    displayName: "American Express",
    notes: "Amex can be integrated with card/account APIs through approved developer credentials."
  })
];

export function getConnectorByProvider(provider: Provider): ProviderConnector {
  const connector = connectorList.find((item) => item.provider === provider);

  if (!connector) {
    throw new Error(`Connector for provider '${provider}' is not configured.`);
  }

  return connector;
}

export function listConnectors(): ProviderConnector[] {
  return connectorList;
}
