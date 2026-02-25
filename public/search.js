function isEditableElement(element) {
  if (!element) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function getSearchInputs() {
  return Array.from(document.querySelectorAll(".search input[type='search']"));
}

function focusSearchInput() {
  const input = getSearchInputs()[0];
  if (!input || input.disabled || input.readOnly) {
    return false;
  }

  input.focus({ preventScroll: true });
  if (typeof input.select === "function") {
    input.select();
  }

  return true;
}

function initSearchFocusBehavior() {
  for (const input of getSearchInputs()) {
    const container = input.closest(".search");
    if (!container) {
      continue;
    }

    container.addEventListener("pointerdown", (event) => {
      if (event.target === input) {
        return;
      }

      if (input.disabled || input.readOnly) {
        return;
      }

      requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
      });
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    if (isEditableElement(document.activeElement)) {
      return;
    }

    const key = event.key;
    const isSlash = key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
    const isCommandK = (key === "k" || key === "K") && (event.metaKey || event.ctrlKey) && !event.altKey;

    if (isSlash || isCommandK) {
      if (focusSearchInput()) {
        event.preventDefault();
      }
      return;
    }

    if (key === "Escape" && document.activeElement?.matches?.(".search input[type='search']")) {
      document.activeElement.blur();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearchFocusBehavior, { once: true });
} else {
  initSearchFocusBehavior();
}
