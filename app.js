const state = {
  rows: [],
  headers: [],
  groupFields: []
};
const LOCAL_DEFAULT_CSV = "./compliance_inventory.csv";

const palette = [
  "#f2f2f2", "#d9d9d9", "#c2c2c2", "#aaaaaa", "#949494", "#7f7f7f",
  "#6a6a6a", "#595959", "#4b4b4b", "#3f3f3f", "#353535", "#2d2d2d"
];

const statusEl = document.getElementById("status");
const loadBtn = document.getElementById("loadBtn");
const urlInput = document.getElementById("sheetUrl");
const fileInput = document.getElementById("csvFile");
const primarySelect = document.getElementById("primarySelect");
const secondarySelect = document.getElementById("secondarySelect");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9f2a24" : "#5f6d68";
}

function parseSheetIdAndGid(url) {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[?#&]gid=([0-9]+)/);
  return {
    id: idMatch ? idMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : "0"
  };
}

function toCsvUrl(sheetUrl) {
  const { id, gid } = parseSheetIdAndGid(sheetUrl);
  if (!id) {
    return null;
  }
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quote) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quote = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quote = true;
      continue;
    }

    if (char === ',') {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(cell.trim());
      cell = "";
      if (row.some((x) => x !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((x) => x !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function buildRecords(parsedRows) {
  if (!parsedRows.length) {
    return { headers: [], rows: [] };
  }

  const headers = parsedRows[0].map((h, i) => h || `Column ${i + 1}`);
  const records = parsedRows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] || "").trim();
    });
    return obj;
  }).filter((r) => Object.values(r).some((v) => v !== ""));

  return { headers, rows: records };
}

function detectGroupFields(headers, rows) {
  const candidates = [];
  const maxDistinct = Math.max(3, Math.min(24, Math.floor(rows.length * 0.55)));

  headers.forEach((header) => {
    const values = rows.map((r) => (r[header] || "").trim()).filter(Boolean);
    if (!values.length) {
      return;
    }
    const distinct = new Set(values);
    if (distinct.size > 1 && distinct.size <= maxDistinct) {
      candidates.push({
        header,
        distinct: distinct.size,
        score: scoreHeader(header)
      });
    }
  });

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.distinct - b.distinct;
  });

  return candidates.map((c) => c.header);
}

function scoreHeader(header) {
  const h = header.toLowerCase();
  let score = 0;
  if (/policy/.test(h)) score += 5;
  if (/standard/.test(h)) score += 5;
  if (/document type/.test(h)) score += 6;
  if (/domain/.test(h)) score += 5;
  if (/tier/.test(h)) score += 4;
  if (/approval/.test(h)) score += 4;
  if (/legal entity|business|status/.test(h)) score += 3;
  if (/framework|control/.test(h)) score += 3;
  if (/category|domain|group|family|type/.test(h)) score += 2;
  if (/description|notes?|detail|evidence|text|link|url|owner|id/.test(h)) score -= 3;
  return score;
}

function countBy(rows, key) {
  const map = new Map();
  rows.forEach((r) => {
    const value = r[key] || "(blank)";
    map.set(value, (map.get(value) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function crossTab(rows, aKey, bKey, topA, topB) {
  const aVals = new Set(topA.map((d) => d[0]));
  const bVals = new Set(topB.map((d) => d[0]));
  const matrix = {};

  topA.forEach(([a]) => {
    matrix[a] = {};
    topB.forEach(([b]) => {
      matrix[a][b] = 0;
    });
  });

  rows.forEach((r) => {
    const a = r[aKey] || "(blank)";
    const b = r[bKey] || "(blank)";
    if (aVals.has(a) && bVals.has(b)) {
      matrix[a][b] += 1;
    }
  });

  return matrix;
}

function fillSelect(select, options) {
  select.innerHTML = "";
  options.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

function updateKpis(rows, fields) {
  document.getElementById("kpiTotal").textContent = rows.length.toLocaleString();
  document.getElementById("kpiFields").textContent = fields.length.toLocaleString();
}

function renderBarChart(items, keyName) {
  const chart = document.getElementById("barChart");
  chart.innerHTML = "";
  document.getElementById("barTitle").textContent = `Top ${keyName} Groups`;

  if (!items.length) {
    chart.textContent = "No data.";
    return;
  }

  const max = items[0][1] || 1;
  items.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const name = document.createElement("div");
    name.textContent = label;

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(value / max) * 100}%`;
    track.appendChild(fill);

    const count = document.createElement("div");
    count.textContent = value;

    row.append(name, track, count);
    chart.appendChild(row);
  });
}

function renderDonut(items, keyName) {
  const wrap = document.getElementById("donutChart");
  wrap.innerHTML = "";
  document.getElementById("donutTitle").textContent = `${keyName} Distribution Share`;

  if (!items.length) {
    wrap.textContent = "No data.";
    return;
  }

  const total = items.reduce((sum, [, value]) => sum + value, 0);
  const size = 210;
  const r = 74;
  const c = 2 * Math.PI * r;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", `${size}`);
  svg.setAttribute("height", `${size}`);

  const base = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  base.setAttribute("cx", `${size / 2}`);
  base.setAttribute("cy", `${size / 2}`);
  base.setAttribute("r", `${r}`);
  base.setAttribute("fill", "none");
  base.setAttribute("stroke", "#2a2a2a");
  base.setAttribute("stroke-width", "28");
  svg.appendChild(base);

  let offset = 0;
  items.forEach(([, value], i) => {
    const seg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const part = value / total;
    seg.setAttribute("cx", `${size / 2}`);
    seg.setAttribute("cy", `${size / 2}`);
    seg.setAttribute("r", `${r}`);
    seg.setAttribute("fill", "none");
    seg.setAttribute("stroke", palette[i % palette.length]);
    seg.setAttribute("stroke-width", "28");
    seg.setAttribute("stroke-dasharray", `${part * c} ${c}`);
    seg.setAttribute("stroke-dashoffset", `${-offset}`);
    seg.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
    svg.appendChild(seg);
    offset += part * c;
  });

  const center = document.createElementNS("http://www.w3.org/2000/svg", "text");
  center.setAttribute("x", `${size / 2}`);
  center.setAttribute("y", `${size / 2 + 5}`);
  center.setAttribute("text-anchor", "middle");
  center.setAttribute("font-size", "20");
  center.setAttribute("font-weight", "700");
  center.setAttribute("fill", "#f2f2f2");
  center.textContent = total;
  svg.appendChild(center);

  const legend = document.createElement("div");
  legend.className = "legend";

  items.forEach(([label, value], i) => {
    const row = document.createElement("div");
    row.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = palette[i % palette.length];
    const text = document.createElement("span");
    const pct = ((value / total) * 100).toFixed(1);
    text.textContent = `${label}: ${value} (${pct}%)`;
    row.append(swatch, text);
    legend.appendChild(row);
  });

  wrap.append(svg, legend);
}

function renderHeatmap(rows, aKey, bKey, limit) {
  const el = document.getElementById("heatmap");
  el.innerHTML = "";
  document.getElementById("heatmapTitle").textContent = `${aKey} x ${bKey}`;

  const topA = countBy(rows, aKey).slice(0, limit);
  const topB = countBy(rows, bKey).slice(0, limit);
  const matrix = crossTab(rows, aKey, bKey, topA, topB);

  const allValues = [];
  topA.forEach(([a]) => {
    topB.forEach(([b]) => {
      allValues.push(matrix[a][b]);
    });
  });

  const max = Math.max(1, ...allValues);

  const table = document.createElement("table");
  table.className = "heatmap-table";

  const thead = document.createElement("thead");
  const hRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = aKey;
  hRow.appendChild(corner);

  topB.forEach(([b]) => {
    const th = document.createElement("th");
    th.textContent = b;
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);

  const tbody = document.createElement("tbody");
  topA.forEach(([a]) => {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = a;
    tr.appendChild(label);

    topB.forEach(([b]) => {
      const td = document.createElement("td");
      const v = matrix[a][b];
      const intensity = v / max;
      td.textContent = String(v);
      td.style.background = `rgba(242, 242, 242, ${Math.max(0.08, intensity * 0.72)})`;
      td.style.color = intensity > 0.65 ? "#050505" : "#dcdcdc";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  el.appendChild(table);
}

function renderPreview(headers, rows, maxRows = 12) {
  const el = document.getElementById("preview");
  el.innerHTML = "";

  if (!rows.length) {
    el.textContent = "No data.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    htr.appendChild(th);
  });
  thead.appendChild(htr);

  const tbody = document.createElement("tbody");
  rows.slice(0, maxRows).forEach((row) => {
    const tr = document.createElement("tr");
    headers.forEach((h) => {
      const td = document.createElement("td");
      td.textContent = row[h] || "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  el.appendChild(table);
}

function updateVisuals() {
  const primary = primarySelect.value;
  const secondary = secondarySelect.value;
  const limit = 12;

  if (!primary || !secondary || !state.rows.length) return;

  const counts = countBy(state.rows, primary).slice(0, limit);
  renderBarChart(counts, primary);
  renderDonut(counts.slice(0, Math.min(8, counts.length)), primary);
  renderHeatmap(state.rows, primary, secondary, Math.min(limit, 12));
}

function hydrateDashboard(headers, rows) {
  state.headers = headers;
  state.rows = rows;
  state.groupFields = detectGroupFields(headers, rows);

  if (!state.groupFields.length) {
    state.groupFields = headers.slice(0, 3);
  }

  fillSelect(primarySelect, state.groupFields);
  fillSelect(secondarySelect, state.groupFields);

  const preferredPrimary = state.groupFields.find((f) => /domain/i.test(f))
    || state.groupFields.find((f) => /business|tier|legal entity/i.test(f))
    || state.groupFields[0];
  const preferredSecondary = state.groupFields.find((f) => /document type|policy|standard/i.test(f))
    || state.groupFields.find((f) => /status|approval/i.test(f))
    || state.groupFields[1]
    || state.groupFields[0];
  primarySelect.value = preferredPrimary;
  secondarySelect.value = preferredSecondary === preferredPrimary && state.groupFields[1]
    ? state.groupFields[1]
    : preferredSecondary;

  updateKpis(rows, state.groupFields);
  renderPreview(headers, rows);
  updateVisuals();
}

async function loadFromUrl() {
  const rawUrl = urlInput.value.trim();
  const csvUrl = toCsvUrl(rawUrl);

  if (!csvUrl) {
    setStatus("Invalid Google Sheet URL.", true);
    return;
  }

  setStatus("Loading data from sheet URL...");

  try {
    const response = await fetch(csvUrl, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    if (text.startsWith("<!DOCTYPE html") || text.includes("Sign in")) {
      throw new Error("The sheet is not publicly readable. Publish or use CSV upload.");
    }

    const parsed = parseCsv(text);
    const { headers, rows } = buildRecords(parsed);
    if (!rows.length) {
      throw new Error("No rows found in sheet.");
    }

    hydrateDashboard(headers, rows);
    setStatus(`Loaded ${rows.length} rows from Google Sheets.`);
  } catch (err) {
    setStatus(`Load failed: ${err.message}`, true);
  }
}

async function loadLocalDefaultCsv() {
  if (typeof window.__LOCAL_CSV === "string" && window.__LOCAL_CSV.trim()) {
    const parsed = parseCsv(window.__LOCAL_CSV);
    const { headers, rows } = buildRecords(parsed);
    if (rows.length) {
      hydrateDashboard(headers, rows);
      setStatus(`Loaded ${rows.length} rows from bundled local CSV data.`);
      return true;
    }
  }

  try {
    const response = await fetch(LOCAL_DEFAULT_CSV, { mode: "cors" });
    if (!response.ok) {
      return false;
    }
    const text = await response.text();
    const parsed = parseCsv(text);
    const { headers, rows } = buildRecords(parsed);
    if (!rows.length) {
      return false;
    }
    hydrateDashboard(headers, rows);
    setStatus(`Loaded ${rows.length} rows from local CSV (${LOCAL_DEFAULT_CSV}).`);
    return true;
  } catch (_err) {
    return false;
  }
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  setStatus(`Reading ${file.name}...`);
  const text = await file.text();
  const parsed = parseCsv(text);
  const { headers, rows } = buildRecords(parsed);

  if (!rows.length) {
    setStatus("CSV has no data rows.", true);
    return;
  }

  hydrateDashboard(headers, rows);
  setStatus(`Loaded ${rows.length} rows from CSV.`);
});

loadBtn.addEventListener("click", loadFromUrl);
primarySelect.addEventListener("change", updateVisuals);
secondarySelect.addEventListener("change", updateVisuals);

setStatus("Enter a Google Sheet URL and click Load, or upload a CSV.");
loadLocalDefaultCsv().then((loaded) => {
  if (!loaded) {
    setStatus("Could not auto-load local data. Use CSV upload.", true);
  }
});
