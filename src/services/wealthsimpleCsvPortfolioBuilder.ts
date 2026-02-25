import { buildManualHoldingsPayloadFromHoldingsReportCsv } from "./wealthsimpleHoldingsReportCsvParser";
import { buildManualHoldingsPayloadFromWealthsimpleCsvFiles, WealthsimpleCsvFileInput } from "./wealthsimpleTransactionsCsvParser";

export type WealthsimpleCsvFormat = "holdings_report" | "transactions_statement" | "unknown";

function firstNonEmptyLine(text: string): string {
  return (
    text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

export function detectWealthsimpleCsvFormat(csvText: string): WealthsimpleCsvFormat {
  const header = firstNonEmptyLine(csvText).toLowerCase();

  if (
    header.includes("account name") &&
    header.includes("account number") &&
    header.includes("market price") &&
    header.includes("market value")
  ) {
    return "holdings_report";
  }

  if (header.includes("date") && header.includes("transaction") && header.includes("description") && header.includes("amount")) {
    return "transactions_statement";
  }

  return "unknown";
}

export function buildManualHoldingsPayloadFromWealthsimpleCsv(files: WealthsimpleCsvFileInput[]): {
  accounts: Array<{ externalId: string; name: string; currency: string; cash: number; holdings: unknown[] }>;
} {
  const holdingsReports = files.filter((file) => detectWealthsimpleCsvFormat(file.csvText) === "holdings_report");
  const statements = files.filter((file) => detectWealthsimpleCsvFormat(file.csvText) === "transactions_statement");

  if (holdingsReports.length > 0) {
    // Holdings reports can contain multiple accounts in a single file. Merge accounts across files.
    const merged = new Map<string, { externalId: string; name: string; currency: string; cash: number; holdings: any[] }>();

    for (const report of holdingsReports) {
      const payload = buildManualHoldingsPayloadFromHoldingsReportCsv(report.csvText);
      for (const account of payload.accounts) {
        const existing = merged.get(account.externalId);
        if (!existing) {
          merged.set(account.externalId, { ...account, holdings: [...account.holdings] });
          continue;
        }

        const bySymbol = new Map<string, any>();
        for (const holding of existing.holdings) {
          bySymbol.set(String(holding.symbol), { ...holding });
        }
        for (const holding of account.holdings) {
          const symbol = String((holding as any).symbol ?? "");
          const current = bySymbol.get(symbol);
          if (!current) {
            bySymbol.set(symbol, { ...holding });
            continue;
          }

          const qty = Number((current.quantity ?? 0) + ((holding as any).quantity ?? 0));
          current.quantity = Number(qty.toFixed(6));
          current.name = current.name ?? (holding as any).name;
          current.quoteSymbol = current.quoteSymbol ?? (holding as any).quoteSymbol;
          current.unitPrice = current.unitPrice ?? (holding as any).unitPrice;
          if (typeof (holding as any).costBasis === "number" && Number.isFinite((holding as any).costBasis)) {
            const basis = Number((current.costBasis ?? 0) + (holding as any).costBasis);
            current.costBasis = Number(basis.toFixed(2));
          }
          bySymbol.set(symbol, current);
        }

        merged.set(account.externalId, {
          ...existing,
          // Cash is not present in holdings report. Keep existing.
          holdings: Array.from(bySymbol.values()).filter((holding) => Number(holding.quantity ?? 0) !== 0)
        });
      }
    }

    // If the user also passed statement files, add any accounts not covered by holdings report.
    if (statements.length > 0) {
      const statementPayload = buildManualHoldingsPayloadFromWealthsimpleCsvFiles(statements);
      for (const account of statementPayload.accounts) {
        if (!merged.has(account.externalId)) {
          merged.set(account.externalId, { ...account, holdings: [...account.holdings] });
        }
      }
    }

    return {
      accounts: Array.from(merged.values())
    };
  }

  if (statements.length > 0) {
    return buildManualHoldingsPayloadFromWealthsimpleCsvFiles(statements);
  }

  throw new Error("Unsupported CSV format. Expected Wealthsimple holdings report or monthly statement transactions export.");
}
