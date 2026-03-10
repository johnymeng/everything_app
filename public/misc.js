import "./search.js";

const searchInput = document.getElementById("appSearchInput");
const clearSearchButton = document.getElementById("clearSearchButton");
const appsGrid = document.getElementById("appsGrid");
const emptyState = document.getElementById("appsEmptyState");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(card, query) {
  if (!query) {
    return true;
  }

  const haystack = normalize(card?.dataset?.title || card?.textContent || "");
  return haystack.includes(query);
}

function applyFilter() {
  if (!appsGrid) return;
  const query = normalize(searchInput?.value || "");
  const cards = Array.from(appsGrid.children);

  let visibleCount = 0;
  for (const card of cards) {
    const visible = matchesQuery(card, query);
    card.classList.toggle("hidden", !visible);
    if (visible) visibleCount += 1;
  }

  if (emptyState) {
    emptyState.classList.toggle("hidden", visibleCount > 0);
  }
}

if (searchInput) {
  searchInput.addEventListener("input", applyFilter);
}

if (clearSearchButton) {
  clearSearchButton.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    applyFilter();
  });
}

applyFilter();

