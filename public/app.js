const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  providers: []
};

const labels = {
  eq_bank: "EQ Bank",
  wealthsimple: "Wealthsimple",
  td: "TD",
  amex: "Amex"
};

const authPanel = document.getElementById("authPanel");
const appPanel = document.getElementById("appPanel");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const nameInput = document.getElementById("nameInput");
const registerButton = document.getElementById("registerButton");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const syncAllButton = document.getElementById("syncAllButton");
const providerButtons = document.getElementById("providerButtons");
const summaryCards = document.getElementById("summaryCards");
const accountsBody = document.getElementById("accountsBody");
const holdingsBody = document.getElementById("holdingsBody");
const liabilitiesBody = document.getElementById("liabilitiesBody");
const userLabel = document.getElementById("userLabel");
const modeHint = document.getElementById("modeHint");
const statusText = document.getElementById("statusText");

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function authHeaders() {
  return state.token
    ? {
        Authorization: `Bearer ${state.token}`
      }
    : {};
}

async function api(path, options = {}, requireAuth = true) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(requireAuth ? authHeaders() : {})
  };

  const response = await fetch(`/api${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(payload.error || "Request failed");
  }

  return response.json();
}

function setToken(token) {
  state.token = token;
  localStorage.setItem("finance_tracker_token", token);
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.providers = [];
  localStorage.removeItem("finance_tracker_token");
  authPanel.classList.remove("hidden");
  appPanel.classList.add("hidden");
  summaryCards.innerHTML = "";
  accountsBody.innerHTML = "";
  holdingsBody.innerHTML = "";
  liabilitiesBody.innerHTML = "";
}

function currency(amount, code = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
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
      <div class="metric-title">${card.title}</div>
      <div class="metric-value ${card.debt ? "debt" : ""}">${card.value}</div>
    `;
    summaryCards.appendChild(element);
  }
}

function renderAccounts(accounts) {
  accountsBody.innerHTML = "";

  for (const account of accounts) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${labels[account.provider] || account.provider}</td>
      <td>${account.name}</td>
      <td>${account.type}</td>
      <td>${currency(account.balance, account.currency)}</td>
      <td>${new Date(account.lastSyncedAt).toLocaleString()}</td>
    `;
    accountsBody.appendChild(row);
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
    holdingsBody.appendChild(row);
  }
}

function renderLiabilities(liabilities) {
  liabilitiesBody.innerHTML = "";

  for (const liability of liabilities) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${labels[liability.provider] || liability.provider}</td>
      <td>${liability.name}</td>
      <td>${liability.kind}</td>
      <td>${currency(liability.balance, liability.currency)}</td>
      <td>${liability.interestRate ?? "-"}</td>
    `;
    liabilitiesBody.appendChild(row);
  }
}

function openPlaidLink(linkToken) {
  return new Promise((resolve, reject) => {
    if (!window.Plaid) {
      reject(new Error("Plaid script not loaded. Check network access to cdn.plaid.com."));
      return;
    }

    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: (publicToken) => {
        resolve(publicToken);
      },
      onExit: (error) => {
        if (error) {
          reject(new Error(error.display_message || error.error_message || "Plaid Link exited with error."));
          return;
        }

        reject(new Error("Connection canceled before completion."));
      }
    });

    handler.open();
  });
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function promptRequired(message, fieldName) {
  const value = window.prompt(message);

  if (value === null) {
    throw new Error(`${fieldName} entry canceled.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function buildEqMobileAuthToken() {
  const email = promptRequired("EQ Bank email:", "Email");
  const password = promptRequired("EQ Bank password:", "Password");
  const stepupTypeInput = window.prompt(
    "If EQ asks for step-up now, enter OTP or QUESTION. Otherwise leave blank.",
    ""
  );
  const stepupType = stepupTypeInput ? stepupTypeInput.trim().toUpperCase() : "";
  const trustDeviceInput = window.prompt("Trust this device for future EQ step-up? yes/no", "yes");
  const trustDevice = !trustDeviceInput || !["no", "n", "false", "0"].includes(trustDeviceInput.toLowerCase());
  const payload = {
    email,
    password,
    trustDevice
  };

  if (stepupType === "OTP") {
    payload.stepupType = "OTP";
    payload.otpPin = promptRequired("Enter the OTP code from EQ Bank:", "OTP code");
  } else if (stepupType === "QUESTION" || stepupType === "CHALLENGED_QUESTION") {
    payload.stepupType = "CHALLENGED_QUESTION";
    payload.questionCode = promptRequired("Enter EQ question code (example: QA_107):", "Question code");
    payload.questionAnswer = promptRequired("Enter your EQ security question answer:", "Question answer");
  }

  return `eq-mobile-auth:${encodeBase64Utf8(JSON.stringify(payload))}`;
}

async function connectProvider(provider) {
  const providerName = provider.displayName || labels[provider.provider] || provider.provider;

  try {
    setStatus(`Generating link token for ${providerName} (${provider.mode})...`);
    const link = await api(`/providers/${provider.provider}/link-token`, {
      method: "POST"
    });

    let publicToken = "";

    if (provider.mode === "mock") {
      publicToken = `mock-public-token:${provider.provider}:${Date.now()}`;
    } else if (provider.mode === "eq_mobile_api") {
      publicToken = buildEqMobileAuthToken();
    } else if (provider.mode === "snaptrade") {
      window.open(link.linkToken, "_blank", "noopener,noreferrer");
      const confirmed = window.confirm(
        "Complete the SnapTrade connection flow in the opened tab, then click OK here to continue."
      );

      if (!confirmed) {
        throw new Error("SnapTrade connection canceled before completion.");
      }

      publicToken = `snaptrade-complete:${provider.provider}:${Date.now()}`;
    } else {
      publicToken = await openPlaidLink(link.linkToken);
    }

    const connection = await api(`/providers/${provider.provider}/exchange`, {
      method: "POST",
      body: JSON.stringify({ publicToken })
    });

    await api(`/connections/${connection.id}/sync`, { method: "POST" });
    await refreshData();
    setStatus(`Connected and synced ${providerName}.`);
  } catch (error) {
    setStatus(error.message || "Provider connection failed.", true);
  }
}

function renderProviderButtons() {
  providerButtons.innerHTML = "";

  for (const provider of state.providers) {
    const button = document.createElement("button");
    const providerName = provider.displayName || labels[provider.provider] || provider.provider;
    button.textContent = `Connect ${providerName} (${provider.mode})`;
    button.addEventListener("click", () => connectProvider(provider));
    providerButtons.appendChild(button);
  }

  const anyLive = state.providers.some((provider) => provider.mode === "plaid");
  const anyEqMobile = state.providers.some((provider) => provider.mode === "eq_mobile_api");
  const anySnaptrade = state.providers.some((provider) => provider.mode === "snaptrade");
  modeHint.textContent = anyEqMobile
    ? "EQ Bank mobile API mode is enabled. You will be prompted for EQ credentials and step-up details."
    : anyLive
    ? "Plaid Link is enabled for one or more providers."
    : anySnaptrade
      ? "SnapTrade mode is enabled for Wealthsimple. Follow the browser-based connection flow."
      : "All providers are in mock mode. Update env to switch providers to plaid/eq_mobile_api/snaptrade mode.";
}

async function refreshData() {
  const [summary, accounts, holdings, liabilities] = await Promise.all([
    api("/summary"),
    api("/accounts"),
    api("/holdings"),
    api("/liabilities")
  ]);

  renderSummary(summary);
  renderAccounts(accounts);
  renderHoldings(holdings);
  renderLiabilities(liabilities);
}

async function initializeAuthenticatedView() {
  authPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userLabel.textContent = `${state.user.name} (${state.user.email})`;

  state.providers = await api("/providers");
  renderProviderButtons();
  await refreshData();
  setStatus("Ready.");
}

async function handleRegister() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const name = nameInput.value.trim();

  try {
    setStatus("Creating account...");
    const result = await api(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, name: name || undefined })
      },
      false
    );

    setToken(result.token);
    state.user = result.user;
    await initializeAuthenticatedView();
  } catch (error) {
    setStatus(error.message || "Register failed.", true);
  }
}

async function handleLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    setStatus("Signing in...");
    const result = await api(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password })
      },
      false
    );

    setToken(result.token);
    state.user = result.user;
    await initializeAuthenticatedView();
  } catch (error) {
    setStatus(error.message || "Login failed.", true);
  }
}

async function restoreSession() {
  if (!state.token) {
    clearSession();
    return;
  }

  try {
    state.user = await api("/auth/me");
    await initializeAuthenticatedView();
  } catch (_error) {
    clearSession();
    setStatus("Session expired. Please sign in again.", true);
  }
}

registerButton.addEventListener("click", handleRegister);
loginButton.addEventListener("click", handleLogin);
logoutButton.addEventListener("click", () => {
  clearSession();
  setStatus("Signed out.");
});

syncAllButton.addEventListener("click", async () => {
  try {
    setStatus("Syncing all connections...");
    await api("/sync-all", {
      method: "POST",
      body: JSON.stringify({})
    });
    await refreshData();
    setStatus("Sync completed.");
  } catch (error) {
    setStatus(error.message || "Sync failed.", true);
  }
});

restoreSession();
