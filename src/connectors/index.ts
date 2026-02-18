import { config } from "../config";
import { Provider } from "../models";
import { EqBankMobileConnector } from "./eqBankMobileConnector";
import { MockConnector } from "./mockConnector";
import { PlaidConnector } from "./plaidConnector";
import { SnapTradeConnector } from "./snapTradeConnector";
import { ProviderConnector } from "./types";

interface ProviderConfig {
  provider: Provider;
  mode: string;
  displayName: string;
}

const providerConfigs: ProviderConfig[] = [
  {
    provider: "eq_bank",
    mode: config.integrations.eqBankMode,
    displayName: "EQ Bank"
  },
  {
    provider: "wealthsimple",
    mode: config.integrations.wealthsimpleMode,
    displayName: "Wealthsimple"
  },
  {
    provider: "td",
    mode: config.integrations.tdMode,
    displayName: "TD Canada Trust"
  },
  {
    provider: "amex",
    mode: config.integrations.amexMode,
    displayName: "American Express"
  }
];

function createConnector(configItem: ProviderConfig): ProviderConnector {
  if (configItem.mode === "mock") {
    return new MockConnector(configItem.provider, configItem.displayName);
  }

  if (configItem.mode === "plaid") {
    return new PlaidConnector(configItem.provider, configItem.displayName);
  }

  if (configItem.mode === "eq_mobile_api") {
    if (configItem.provider !== "eq_bank") {
      throw new Error("eq_mobile_api mode is only supported for eq_bank provider.");
    }

    return new EqBankMobileConnector(configItem.provider, configItem.displayName);
  }

  if (configItem.mode === "snaptrade") {
    if (configItem.provider !== "wealthsimple") {
      throw new Error("snaptrade mode is only supported for wealthsimple provider.");
    }

    return new SnapTradeConnector(configItem.provider, configItem.displayName);
  }

  throw new Error(
    `Unsupported mode '${configItem.mode}' for ${configItem.provider}. Use 'mock', 'plaid', 'eq_mobile_api', or 'snaptrade'.`
  );
}

const connectorList: ProviderConnector[] = providerConfigs.map(createConnector);

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
