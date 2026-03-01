let allPrompts = [];
let selected = null;
let filter = "all";

const promptListEl = document.getElementById("promptList");
const searchInput = document.getElementById("searchInput");
const countText = document.getElementById("countText");
const editorArea = document.getElementById("editorArea");
const saveBtn = document.getElementById("saveBtn");
const metaName = document.getElementById("metaName");
const metaFile = document.getElementById("metaFile");
const metaVariant = document.getElementById("metaVariant");
const diffView = document.getElementById("diffView");
const diffTitle = document.getElementById("diffTitle");
const refreshBtn = document.getElementById("refreshBtn");

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function lineDiff(leftText, rightText) {
  const left = leftText.split("\n");
  const right = rightText.split("\n");
  const max = Math.max(left.length, right.length);
  const lines = [];

  for (let i = 0; i < max; i += 1) {
    const a = left[i] ?? "";
    const b = right[i] ?? "";
    if (a === b) {
      lines.push(`  ${a}`);
    } else {
      if (a) lines.push(`- ${a}`);
      if (b) lines.push(`+ ${b}`);
    }
  }
  return lines.join("\n");
}

function normaliseName(name) {
  return name.replace(/^TESTING_/i, "").replace(/_TESTING$/i, "").replace(/_V\d+$/i, "").toUpperCase();
}

function getPair(prompt) {
  const targetGroup = normaliseName(prompt.name);
  return allPrompts.find((p) => p.id !== prompt.id && normaliseName(p.name) === targetGroup);
}

function renderDiff(prompt) {
  const pair = getPair(prompt);
  if (!pair) {
    diffTitle.textContent = "Testing vs Non-testing Diff";
    diffView.textContent = "No matching testing/non-testing pair found.";
    return;
  }

  const left = prompt.variant === "testing" ? pair : prompt;
  const right = prompt.variant === "testing" ? prompt : pair;
  diffTitle.textContent = `${left.name} (normal)  <->  ${right.name} (testing)`;
  diffView.innerHTML = escapeHtml(lineDiff(left.body, right.body));
}

function renderSelected() {
  if (!selected) {
    metaName.textContent = "Select a prompt";
    metaFile.textContent = "";
    metaVariant.textContent = "";
    editorArea.value = "";
    editorArea.disabled = true;
    saveBtn.disabled = true;
    diffView.textContent = "Select a prompt to view pair diff.";
    return;
  }

  metaName.textContent = selected.name;
  metaFile.textContent = selected.file;
  metaVariant.textContent = selected.variant;
  editorArea.value = selected.body;
  editorArea.disabled = false;
  saveBtn.disabled = false;
  renderDiff(selected);
}

function passesFilter(prompt) {
  if (filter !== "all" && prompt.variant !== filter) return false;

  const q = searchInput.value.trim().toLowerCase();
  if (!q) return true;

  return (
    prompt.name.toLowerCase().includes(q) ||
    prompt.file.toLowerCase().includes(q) ||
    prompt.body.toLowerCase().includes(q)
  );
}

function renderList() {
  const visible = allPrompts.filter(passesFilter);
  countText.textContent = `${visible.length} prompts`;

  promptListEl.innerHTML = visible.map((prompt) => {
    const active = selected?.id === prompt.id ? "active" : "";
    return `
      <div class="prompt-item ${active}" data-id="${prompt.id}">
        <div class="prompt-title">${escapeHtml(prompt.name)} <span class="badge">${prompt.variant}</span></div>
        <div class="prompt-file">${escapeHtml(prompt.file)}</div>
        <div class="prompt-preview">${escapeHtml(prompt.preview || "")}</div>
      </div>
    `;
  }).join("");

  for (const item of promptListEl.querySelectorAll(".prompt-item")) {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-id");
      selected = allPrompts.find((p) => p.id === id) ?? null;
      renderList();
      renderSelected();
    });
  }
}

async function fetchPrompts() {
  const resp = await fetch("/api/prompts");
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Failed to fetch prompts");

  allPrompts = data.prompts;
  if (selected) {
    selected = allPrompts.find((p) => p.id === selected.id) ?? null;
  }
  renderList();
  renderSelected();
}

async function saveCurrent() {
  if (!selected) return;
  const payload = {
    file: selected.file,
    name: selected.name,
    bodyStart: selected.bodyStart,
    bodyEnd: selected.bodyEnd,
    newBody: editorArea.value,
  };

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  try {
    const resp = await fetch("/api/prompts/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Save failed");
    await fetchPrompts();
    saveBtn.textContent = "Saved";
    setTimeout(() => {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }, 900);
  } catch (err) {
    alert(String(err));
    saveBtn.textContent = "Save";
    saveBtn.disabled = false;
  }
}

searchInput.addEventListener("input", renderList);
editorArea.addEventListener("input", () => {
  if (selected) selected.body = editorArea.value;
});
saveBtn.addEventListener("click", saveCurrent);
refreshBtn.addEventListener("click", fetchPrompts);

for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    for (const c of document.querySelectorAll(".chip")) c.classList.remove("active");
    chip.classList.add("active");
    filter = chip.getAttribute("data-filter") || "all";
    renderList();
  });
}

fetchPrompts().catch((err) => {
  alert(String(err));
});
