import crypto from "node:crypto";
import { AccountType, TransactionDirection } from "../models";
import { SyncedAccount, SyncedTransaction } from "../connectors/types";

export interface CsvStatementImportInput {
  csvText: string;
  institutionName?: string;
  defaultAccountName?: string;
  defaultAccountType?: AccountType;
  defaultCurrency?: string;
  dayFirst?: boolean;
}

export interface CsvStatementParseResult {
  accounts: SyncedAccount[];
  transactions: SyncedTransaction[];
  rowsRead: number;
  rowsImported: number;
  rowsSkipped: number;
  detectedColumns: Record<string, string>;
}

interface ParsedRow {
  accountExternalId: string;
  accountName: string;
  currency: string;
  direction: TransactionDirection;
  amount: number;
  signedAmount: number;
  date: string;
  description: string;
  category: string;
  runningBalance?: number;
  signature: string;
}

interface AccountAccumulator {
  externalId: string;
  name: string;
  currency: string;
  type: AccountType;
  runningBalance?: number;
  signedNet: number;
  rows: ParsedRow[];
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeCurrency(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const upper = value.trim().toUpperCase();

  if (!upper) {
    return fallback;
  }

  return upper.length > 3 ? upper.slice(0, 3) : upper;
}

function inferAccountType(accountName: string): AccountType {
  const normalized = accountName.toLowerCase();

  if (normalized.includes("credit")) {
    return "credit_card";
  }

  if (normalized.includes("mortgage")) {
    return "mortgage";
  }

  if (normalized.includes("loan")) {
    return "loan";
  }

  if (normalized.includes("line of credit") || normalized.includes("loc")) {
    return "line_of_credit";
  }

  if (normalized.includes("saving")) {
    return "savings";
  }

  if (normalized.includes("chequing") || normalized.includes("checking")) {
    return "chequing";
  }

  if (
    normalized.includes("invest") ||
    normalized.includes("tfsa") ||
    normalized.includes("rrsp") ||
    normalized.includes("gic")
  ) {
    return "investment";
  }

  return "cash";
}

function sha(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function accountExternalId(institutionName: string, accountKey: string): string {
  return `csv-${sha(`${institutionName}|${accountKey}`).slice(0, 18)}`;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  let value = raw.trim();

  if (!value) {
    return null;
  }

  let negative = false;

  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }

  if (/^-/.test(value)) {
    negative = true;
  }

  if (/\bdr\b/i.test(value) || /\bdebit\b/i.test(value)) {
    negative = true;
  }

  if (/\bcr\b/i.test(value) || /\bcredit\b/i.test(value)) {
    negative = false;
  }

  value = value.replace(/[^\d.,-]/g, "");

  if (value.includes(",") && value.includes(".")) {
    value = value.replace(/,/g, "");
  } else if (value.includes(",") && !value.includes(".")) {
    const commaParts = value.split(",");

    if (commaParts.length === 2 && commaParts[1].length <= 2) {
      value = `${commaParts[0]}.${commaParts[1]}`;
    } else {
      value = value.replace(/,/g, "");
    }
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return negative ? -Math.abs(parsed) : parsed;
}

function toIsoDate(raw: string | undefined, dayFirst: boolean): string | null {
  if (!raw) {
    return null;
  }

  const value = raw.trim();

  if (!value) {
    return null;
  }

  const isoPattern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  const localPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/;

  const isoMatch = value.match(isoPattern);

  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1], 10);
    const month = Number.parseInt(isoMatch[2], 10);
    const day = Number.parseInt(isoMatch[3], 10);
    return validDate(year, month, day);
  }

  const localMatch = value.match(localPattern);

  if (localMatch) {
    const first = Number.parseInt(localMatch[1], 10);
    const second = Number.parseInt(localMatch[2], 10);
    let year = Number.parseInt(localMatch[3], 10);

    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }

    let month = first;
    let day = second;

    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      month = first;
      day = second;
    } else if (dayFirst) {
      day = first;
      month = second;
    }

    return validDate(year, month, day);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function pickIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const exact = headers.findIndex((header) => header === alias);

    if (exact >= 0) {
      return exact;
    }
  }

  for (const alias of aliases) {
    const loose = headers.findIndex((header) => header.includes(alias));

    if (loose >= 0) {
      return loose;
    }
  }

  return -1;
}

function detectDelimiter(text: string): string {
  const sampleLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const commaCount = (sampleLine.match(/,/g) ?? []).length;
  const semicolonCount = (sampleLine.match(/;/g) ?? []).length;
  const tabCount = (sampleLine.match(/\t/g) ?? []).length;

  if (semicolonCount > commaCount && semicolonCount >= tabCount) {
    return ";";
  }

  if (tabCount > commaCount && tabCount > semicolonCount) {
    return "\t";
  }

  return ",";
}

function parseCsvRows(rawCsv: string): string[][] {
  const delimiter = detectDelimiter(rawCsv);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < rawCsv.length; index += 1) {
    const char = rawCsv[index];

    if (char === "\"") {
      if (inQuotes && rawCsv[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && rawCsv[index + 1] === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows
    .map((parsedRow) => parsedRow.map((value) => value.trim()))
    .filter((parsedRow) => parsedRow.some((value) => value !== ""));
}

function columnAliases(): Record<string, string[]> {
  return {
    date: ["date", "transactiondate", "posteddate", "postingdate", "valuedate"],
    description: ["description", "memo", "details", "merchant", "payee", "narrative", "transaction"],
    amount: ["amount", "transactionamount", "value", "amt"],
    debit: ["debit", "withdrawal", "outflow", "moneyout"],
    credit: ["credit", "deposit", "inflow", "moneyin"],
    balance: ["balance", "runningbalance", "currentbalance", "availablebalance"],
    category: ["category", "typecategory", "expensecategory"],
    type: ["type", "transactiontype", "drcr"],
    currency: ["currency", "currencycode", "iso"],
    accountName: ["accountname", "account", "acctname"],
    accountNumber: ["accountnumber", "acctnumber", "accountno", "acctno", "iban"]
  };
}

function buildDetectedColumns(headersRaw: string[], indexes: Record<string, number>): Record<string, string> {
  const detected: Record<string, string> = {};

  for (const [key, index] of Object.entries(indexes)) {
    if (index >= 0) {
      detected[key] = headersRaw[index];
    }
  }

  return detected;
}

function parseSignedAmount(
  row: string[],
  indexes: Record<string, number>,
  typeValue: string
): { direction: TransactionDirection; amount: number; signedAmount: number } | null {
  const debit = indexes.debit >= 0 ? parseNumber(row[indexes.debit]) : null;
  const credit = indexes.credit >= 0 ? parseNumber(row[indexes.credit]) : null;

  if ((debit ?? 0) !== 0 || (credit ?? 0) !== 0) {
    const debitAbs = Math.abs(debit ?? 0);
    const creditAbs = Math.abs(credit ?? 0);

    if (creditAbs > 0 && debitAbs === 0) {
      return {
        direction: "credit",
        amount: creditAbs,
        signedAmount: creditAbs
      };
    }

    if (debitAbs > 0 && creditAbs === 0) {
      return {
        direction: "debit",
        amount: debitAbs,
        signedAmount: -debitAbs
      };
    }

    const signed = creditAbs - debitAbs;

    if (signed !== 0) {
      return {
        direction: signed >= 0 ? "credit" : "debit",
        amount: Math.abs(signed),
        signedAmount: signed
      };
    }
  }

  if (indexes.amount >= 0) {
    const signed = parseNumber(row[indexes.amount]);

    if (signed === null || signed === 0) {
      return null;
    }

    const normalizedType = typeValue.toLowerCase();
    const forceDebit =
      normalizedType.includes("debit") ||
      normalizedType.includes("withdrawal") ||
      normalizedType.includes("purchase") ||
      normalizedType.includes("payment");
    const forceCredit = normalizedType.includes("credit") || normalizedType.includes("deposit");
    const direction = forceDebit ? "debit" : forceCredit ? "credit" : signed < 0 ? "debit" : "credit";
    const signedAmount = direction === "debit" ? -Math.abs(signed) : Math.abs(signed);

    return {
      direction,
      amount: Math.abs(signedAmount),
      signedAmount
    };
  }

  return null;
}

export function parseStatementCsv(input: CsvStatementImportInput): CsvStatementParseResult {
  const csvText = input.csvText.replace(/^\uFEFF/, "");
  const rows = parseCsvRows(csvText);

  if (rows.length < 2) {
    throw new Error("CSV import requires a header row plus at least one data row.");
  }

  const headersRaw = rows[0];
  const headers = headersRaw.map(normalizeHeader);
  const aliases = columnAliases();
  const indexes = {
    date: pickIndex(headers, aliases.date),
    description: pickIndex(headers, aliases.description),
    amount: pickIndex(headers, aliases.amount),
    debit: pickIndex(headers, aliases.debit),
    credit: pickIndex(headers, aliases.credit),
    balance: pickIndex(headers, aliases.balance),
    category: pickIndex(headers, aliases.category),
    type: pickIndex(headers, aliases.type),
    currency: pickIndex(headers, aliases.currency),
    accountName: pickIndex(headers, aliases.accountName),
    accountNumber: pickIndex(headers, aliases.accountNumber)
  };

  if (indexes.date < 0) {
    throw new Error("CSV import failed: could not find a date column.");
  }

  if (indexes.amount < 0 && indexes.debit < 0 && indexes.credit < 0) {
    throw new Error("CSV import failed: could not find amount/debit/credit columns.");
  }

  const institutionName = input.institutionName?.trim() || "Manual CSV Import";
  const defaultCurrency = normalizeCurrency(input.defaultCurrency, "CAD");
  const defaultAccountName = input.defaultAccountName?.trim() || "Imported Account";
  const accountType = input.defaultAccountType;
  const byAccount = new Map<string, AccountAccumulator>();
  const rowCount = rows.length - 1;
  let importedRows = 0;
  let skippedRows = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const date = toIsoDate(row[indexes.date], input.dayFirst ?? false);
    const descriptionRaw = indexes.description >= 0 ? row[indexes.description] : "";
    const typeRaw = indexes.type >= 0 ? row[indexes.type] : "";
    const description = (descriptionRaw || typeRaw || "Statement transaction").trim();

    if (!date) {
      skippedRows += 1;
      continue;
    }

    const parsedAmount = parseSignedAmount(row, indexes, typeRaw);

    if (!parsedAmount) {
      skippedRows += 1;
      continue;
    }

    const currency = normalizeCurrency(indexes.currency >= 0 ? row[indexes.currency] : undefined, defaultCurrency);
    const accountLabelRaw =
      (indexes.accountName >= 0 ? row[indexes.accountName] : "") ||
      (indexes.accountNumber >= 0 ? row[indexes.accountNumber] : "") ||
      defaultAccountName;
    const accountLabel = accountLabelRaw.trim() || defaultAccountName;
    const accountId = accountExternalId(institutionName, accountLabel);
    const category = (indexes.category >= 0 ? row[indexes.category] : "").trim() || "statement_import";
    const balance = indexes.balance >= 0 ? parseNumber(row[indexes.balance]) : null;
    const signature = `${date}|${description}|${parsedAmount.amount}|${parsedAmount.direction}|${category}`;

    if (!byAccount.has(accountId)) {
      byAccount.set(accountId, {
        externalId: accountId,
        name: accountLabel,
        currency,
        type: accountType ?? inferAccountType(accountLabel),
        runningBalance: balance ?? undefined,
        signedNet: 0,
        rows: []
      });
    }

    const account = byAccount.get(accountId)!;

    account.signedNet += parsedAmount.signedAmount;

    if (balance !== null) {
      account.runningBalance = balance;
    }

    account.rows.push({
      accountExternalId: accountId,
      accountName: accountLabel,
      currency,
      direction: parsedAmount.direction,
      amount: parsedAmount.amount,
      signedAmount: parsedAmount.signedAmount,
      date,
      description,
      category,
      runningBalance: balance ?? undefined,
      signature
    });

    importedRows += 1;
  }

  const accounts: SyncedAccount[] = [];
  const transactions: SyncedTransaction[] = [];

  for (const account of byAccount.values()) {
    const inferredBalance =
      account.type === "credit_card" ||
      account.type === "loan" ||
      account.type === "line_of_credit" ||
      account.type === "mortgage"
        ? Math.abs(account.signedNet)
        : account.signedNet;
    const balance = account.runningBalance ?? Number(inferredBalance.toFixed(2));

    accounts.push({
      externalId: account.externalId,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: Number(balance.toFixed(2)),
      institutionName
    });

    const signatureCounts = new Map<string, number>();

    for (const row of account.rows) {
      const count = signatureCounts.get(row.signature) ?? 0;
      signatureCounts.set(row.signature, count + 1);
      const transactionHash = sha(`${account.externalId}|${row.signature}|${count}`).slice(0, 24);

      transactions.push({
        externalId: `csv-${transactionHash}`,
        accountExternalId: account.externalId,
        date: row.date,
        description: row.description,
        category: row.category,
        amount: Number(row.amount.toFixed(2)),
        direction: row.direction,
        currency: row.currency
      });
    }
  }

  if (transactions.length === 0) {
    throw new Error("CSV import failed: no transaction rows were parsed.");
  }

  return {
    accounts,
    transactions,
    rowsRead: rowCount,
    rowsImported: importedRows,
    rowsSkipped: skippedRows,
    detectedColumns: buildDetectedColumns(headersRaw, indexes)
  };
}
