import fs from "node:fs/promises";
import path from "node:path";
import { ManualHoldingsConnector } from "../connectors/manualHoldingsConnector";
import { buildManualHoldingsPayloadFromWealthsimpleCsvFiles } from "../services/wealthsimpleTransactionsCsvParser";

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2).filter(Boolean);

  if (filePaths.length === 0) {
    // eslint-disable-next-line no-console
    console.error("Usage: npm run wealthsimple:value -- <csv1> <csv2> ...");
    process.exit(2);
  }

  const files = await Promise.all(
    filePaths.map(async (filePath) => ({
      fileName: path.basename(filePath),
      csvText: await fs.readFile(filePath, "utf8")
    }))
  );

  const payload = buildManualHoldingsPayloadFromWealthsimpleCsvFiles(files);
  const connector = new ManualHoldingsConnector("wealthsimple", "Wealthsimple");
  const syncPayload = await connector.sync(
    {
      id: "local",
      userId: "local",
      provider: "wealthsimple",
      status: "connected",
      displayName: "Local",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      accessToken: JSON.stringify(payload)
    }
  );

  const holdingsByAccount = new Map<string, typeof syncPayload.holdings>();
  for (const holding of syncPayload.holdings) {
    const list = holdingsByAccount.get(holding.accountExternalId) ?? [];
    list.push(holding);
    holdingsByAccount.set(holding.accountExternalId, list);
  }

  const accountValues: Array<{ name: string; value: number; holdings: number }> = [];
  for (const account of syncPayload.accounts) {
    const holdings = holdingsByAccount.get(account.externalId) ?? [];
    const value = sum(holdings.map((holding) => holding.value));
    accountValues.push({ name: account.name, value, holdings: holdings.length });
  }

  accountValues.sort((a, b) => b.value - a.value);
  const total = sum(accountValues.map((account) => account.value));

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ accounts: accountValues, total, pricedAt: new Date().toISOString() }, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

