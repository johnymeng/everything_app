import fs from "node:fs";
import path from "node:path";
import { FinanceStore } from "./models";

const emptyStore: FinanceStore = {
  connections: [],
  accounts: [],
  holdings: [],
  liabilities: [],
  transactions: []
};

export class JsonStore {
  constructor(private readonly filePath: string) {
    const absoluteFile = path.resolve(this.filePath);
    const directory = path.dirname(absoluteFile);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(absoluteFile)) {
      fs.writeFileSync(absoluteFile, JSON.stringify(emptyStore, null, 2), "utf8");
    }
  }

  read(): FinanceStore {
    const absoluteFile = path.resolve(this.filePath);
    const raw = fs.readFileSync(absoluteFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<FinanceStore>;

    return {
      connections: parsed.connections ?? [],
      accounts: parsed.accounts ?? [],
      holdings: parsed.holdings ?? [],
      liabilities: parsed.liabilities ?? [],
      transactions: parsed.transactions ?? []
    };
  }

  write(store: FinanceStore): void {
    const absoluteFile = path.resolve(this.filePath);
    fs.writeFileSync(absoluteFile, JSON.stringify(store, null, 2), "utf8");
  }
}
