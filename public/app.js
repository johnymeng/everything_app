const userId = "demo-user";

const labels = {
  eq_bank: "EQ Bank",
  wealthsimple: "Wealthsimple",
  td: "TD",
  amex: "Amex"
};

const providerButtons = document.getElementById("providerButtons");
const summaryCards = document.getElementById("summaryCards");
const accountsBody = document.getElementById("accountsBody");
const holdingsBody = document.getElementById("holdingsBody");
const liabilitiesBody = document.getElementById("liabilitiesBody");
const statusText = document.getElementById("statusText");
const syncAllButton = document.getElementById("syncAllButton");

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(payload.error ?? "API request failed");
  }

  return response.json();
}

function currency(amount, code = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(
    amount
  );
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function renderProviderButtons(providers) {
  providerButtons.innerHTML = "";

  for (const provider of providers) {
    const button = document.createElement("button");
    const providerName = provider.displayName ?? labels[provider.provider] ?? provider.provider;
    button.textContent = `Connect ${providerName}`;
    button.addEventListener("click", async () => {
      try {
        setStatus(`Connecting ${providerName} (${provider.mode})...`);
        const connection = await api("/connections", {
          method: "POST",
          body: JSON.stringify({ userId, provider: provider.provider })
        });

        await api(`/connections/${connection.id}/sync`, { method: "POST" });
        await refresh();
        setStatus(`Connected and synced ${providerName}.`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    providerButtons.append(button);
  }
}

function renderSummary(summary) {
  summaryCards.innerHTML = "";

  const cards = [
    { title: "Total Assets", value: currency(summary.totals.assets) },
    { title: "Cash + Savings", value: currency(summary.totals.cashAndSavings) },
    { title: "Investments", value: currency(summary.totals.investments) },
    { title: "Total Debt", value: currency(summary.totals.debt), debt: true },
    { title: "Net Worth", value: currency(summary.totals.netWorth) }
  ];

  for (const card of cards) {
    const element = document.createElement("article");
    element.className = "card";
    element.innerHTML = `
      <div class="card-title">${card.title}</div>
      <div class="metric ${card.debt ? "debt" : ""}">${card.value}</div>
    `;
    summaryCards.append(element);
  }
}

function renderAccounts(accounts) {
  accountsBody.innerHTML = "";

  for (const account of accounts) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${labels[account.provider] ?? account.provider}</td>
      <td>${account.name}</td>
      <td>${account.type}</td>
      <td>${currency(account.balance, account.currency)}</td>
      <td>${new Date(account.lastSyncedAt).toLocaleString()}</td>
    `;
    accountsBody.append(row);
  }
}

function renderHoldings(holdings) {
  holdingsBody.innerHTML = "";

  for (const holding of holdings) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${holding.symbol}</td>
      <td>${holding.name}</td>
      <td>${holding.quantity}</td>
      <td>${currency(holding.unitPrice, holding.currency)}</td>
      <td>${currency(holding.value, holding.currency)}</td>
    `;
    holdingsBody.append(row);
  }
}

function renderLiabilities(liabilities) {
  liabilitiesBody.innerHTML = "";

  for (const liability of liabilities) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${labels[liability.provider] ?? liability.provider}</td>
      <td>${liability.name}</td>
      <td>${liability.kind}</td>
      <td>${currency(liability.balance, liability.currency)}</td>
      <td>${liability.interestRate ?? "-"}</td>
    `;
    liabilitiesBody.append(row);
  }
}

async function refresh() {
  const [summary, accounts, holdings, liabilities] = await Promise.all([
    api(`/summary?userId=${encodeURIComponent(userId)}`),
    api(`/accounts?userId=${encodeURIComponent(userId)}`),
    api(`/holdings?userId=${encodeURIComponent(userId)}`),
    api(`/liabilities?userId=${encodeURIComponent(userId)}`)
  ]);

  renderSummary(summary);
  renderAccounts(accounts);
  renderHoldings(holdings);
  renderLiabilities(liabilities);
}

syncAllButton.addEventListener("click", async () => {
  try {
    setStatus("Syncing all connections...");
    await api("/sync-all", {
      method: "POST",
      body: JSON.stringify({ userId })
    });
    await refresh();
    setStatus("Sync completed.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

async function start() {
  try {
    const providers = await api("/providers");
    renderProviderButtons(providers);
    await refresh();
    setStatus("Ready.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

start();
