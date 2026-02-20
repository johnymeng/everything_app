import fs from "node:fs/promises";
import path from "node:path";
import { buildManualHoldingsPayloadFromWealthsimpleCsvFiles } from "../services/wealthsimpleTransactionsCsvParser";

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2).filter(Boolean);

  if (filePaths.length === 0) {
    // eslint-disable-next-line no-console
    console.error("Usage: npm run wealthsimple:payload -- <csv1> <csv2> ...");
    process.exit(2);
  }

  const files = await Promise.all(
    filePaths.map(async (filePath) => ({
      fileName: path.basename(filePath),
      csvText: await fs.readFile(filePath, "utf8")
    }))
  );

  const payload = buildManualHoldingsPayloadFromWealthsimpleCsvFiles(files);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

