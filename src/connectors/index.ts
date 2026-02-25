import { config } from "../config";
import { Provider } from "../models";
import { DisabledConnector } from "./disabledConnector";
import { EqBankMobileConnector } from "./eqBankMobileConnector";
import { ManualHoldingsConnector } from "./manualHoldingsConnector";
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
  // Backwards compatibility: mock mode removed; treat as disabled.
  const mode = configItem.mode === "mock" ? "disabled" : configItem.mode;

  if (mode === "disabled") {
    return new DisabledConnector(
      configItem.provider,
      configItem.displayName,
      `Provider '${configItem.provider}' is disabled. Set ${configItem.provider.toUpperCase()}_MODE to enable it.`
    );
  }

  if (mode === "plaid") {
    return new PlaidConnector(configItem.provider, configItem.displayName);
  }

  if (mode === "eq_mobile_api") {
    if (configItem.provider !== "eq_bank") {
      throw new Error("eq_mobile_api mode is only supported for eq_bank provider.");
    }

    return new EqBankMobileConnector(configItem.provider, configItem.displayName);
  }

  if (mode === "snaptrade") {
    if (configItem.provider !== "wealthsimple") {
      throw new Error("snaptrade mode is only supported for wealthsimple provider.");
    }

    return new SnapTradeConnector(configItem.provider, configItem.displayName);
  }

  if (mode === "manual_holdings") {
    if (configItem.provider !== "wealthsimple") {
      throw new Error("manual_holdings mode is only supported for wealthsimple provider.");
    }

    return new ManualHoldingsConnector(configItem.provider, configItem.displayName);
  }

  throw new Error(
    `Unsupported mode '${configItem.mode}' for ${configItem.provider}. Use 'disabled', 'plaid', 'eq_mobile_api', 'snaptrade', or 'manual_holdings'.`
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
