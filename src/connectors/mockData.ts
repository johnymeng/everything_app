import { Provider } from "../models";
import { SyncPayload } from "./types";

const now = new Date().toISOString().slice(0, 10);

const payloads: Record<Provider, SyncPayload> = {
  eq_bank: {
    accounts: [
      {
        externalId: "eq_chequing_001",
        name: "EQ Personal Account",
        type: "chequing",
        currency: "CAD",
        balance: 4625.12,
        institutionName: "EQ Bank"
      },
      {
        externalId: "eq_savings_001",
        name: "EQ Savings Plus",
        type: "savings",
        currency: "CAD",
        balance: 18340.55,
        institutionName: "EQ Bank"
      }
    ],
    holdings: [],
    liabilities: [],
    transactions: [
      {
        externalId: "eq_tx_001",
        accountExternalId: "eq_chequing_001",
        date: now,
        description: "Payroll deposit",
        category: "income",
        amount: 2800,
        direction: "credit",
        currency: "CAD"
      },
      {
        externalId: "eq_tx_002",
        accountExternalId: "eq_chequing_001",
        date: now,
        description: "Rent payment",
        category: "housing",
        amount: 1750,
        direction: "debit",
        currency: "CAD"
      }
    ]
  },
  wealthsimple: {
    accounts: [
      {
        externalId: "ws_invest_001",
        name: "Wealthsimple Trade",
        type: "investment",
        currency: "CAD",
        balance: 0,
        institutionName: "Wealthsimple"
      }
    ],
    holdings: [
      {
        externalId: "ws_holding_xeqt",
        accountExternalId: "ws_invest_001",
        symbol: "XEQT",
        name: "iShares Core Equity ETF",
        quantity: 140,
        unitPrice: 34.4,
        value: 4816,
        currency: "CAD"
      },
      {
        externalId: "ws_holding_vfv",
        accountExternalId: "ws_invest_001",
        symbol: "VFV",
        name: "Vanguard S&P 500 ETF",
        quantity: 36,
        unitPrice: 129.8,
        value: 4672.8,
        currency: "CAD"
      }
    ],
    liabilities: [],
    transactions: [
      {
        externalId: "ws_tx_001",
        accountExternalId: "ws_invest_001",
        date: now,
        description: "XEQT buy",
        category: "investment",
        amount: 688,
        direction: "debit",
        currency: "CAD"
      }
    ]
  },
  td: {
    accounts: [
      {
        externalId: "td_chequing_001",
        name: "TD Everyday Chequing",
        type: "chequing",
        currency: "CAD",
        balance: 2350.41,
        institutionName: "TD Canada Trust"
      },
      {
        externalId: "td_loc_001",
        name: "TD Line of Credit",
        type: "line_of_credit",
        currency: "CAD",
        balance: 0,
        institutionName: "TD Canada Trust"
      }
    ],
    holdings: [],
    liabilities: [
      {
        externalId: "td_liability_loc_001",
        accountExternalId: "td_loc_001",
        kind: "line_of_credit",
        name: "TD Line of Credit",
        balance: 9200,
        interestRate: 8.75,
        minimumPayment: 185,
        currency: "CAD",
        dueDate: now
      }
    ],
    transactions: [
      {
        externalId: "td_tx_001",
        accountExternalId: "td_chequing_001",
        date: now,
        description: "Utilities",
        category: "bills",
        amount: 212.34,
        direction: "debit",
        currency: "CAD"
      }
    ]
  },
  amex: {
    accounts: [
      {
        externalId: "amex_cc_001",
        name: "Amex Cobalt Card",
        type: "credit_card",
        currency: "CAD",
        balance: 0,
        institutionName: "American Express"
      }
    ],
    holdings: [],
    liabilities: [
      {
        externalId: "amex_liability_cc_001",
        accountExternalId: "amex_cc_001",
        kind: "credit_card",
        name: "Amex Cobalt Statement",
        balance: 1380.44,
        interestRate: 20.99,
        minimumPayment: 69,
        currency: "CAD",
        dueDate: now
      }
    ],
    transactions: [
      {
        externalId: "amex_tx_001",
        accountExternalId: "amex_cc_001",
        date: now,
        description: "Groceries",
        category: "food",
        amount: 142.72,
        direction: "debit",
        currency: "CAD"
      },
      {
        externalId: "amex_tx_002",
        accountExternalId: "amex_cc_001",
        date: now,
        description: "Statement payment",
        category: "credit_card_payment",
        amount: 400,
        direction: "credit",
        currency: "CAD"
      }
    ]
  },
  manual_csv: {
    accounts: [],
    holdings: [],
    liabilities: [],
    transactions: []
  }
};

export function getMockPayload(provider: Provider): SyncPayload {
  return payloads[provider];
}
