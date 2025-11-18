// src/script.js (module)
import { downloadJSON, downloadPNGFromSVG } from "./utils.js";

/* ---------- configuration ---------- */
const svgEl = d3.select("#networkSvg");
const tooltip = d3.select("#tooltip");
const sidebarWidth = 320;
let width = window.innerWidth - sidebarWidth - 36;
let height = window.innerHeight - 36;

svgEl.attr("width", width).attr("height", height);

// color map
const colorMap = { "NATO": "#3a86ff", "CSTO": "#ff0000" };

/* ---------- initial data ---------- */
let nodes = [
  { id: 1, label: "USA", group: "NATO", fields: { population: "330M", GDP: "$21T", description: "North American country" } },
  { id: 2, label: "UK", group: "NATO", fields: { population: "67M", GDP: "$3T", description: "European country" } },
  { id: 3, label: "France", group: "NATO", fields: { population: "65M", GDP: "$2.8T", description: "European country" } },
  { id: 4, label: "Russia", group: "CSTO", fields: { population: "146M", GDP: "$1.7T", description: "Eurasian country" } },
  { id: 5, label: "Belarus", group: "CSTO", fields: { population: "9.4M", GDP: "$60B", description: "Eastern European country" } }
];

let links = [
  { source: 1, target: 2, relationship: "Alliance" },
  { source: 1, target: 3, relationship: "Alliance" },
  { source: 4, target: 5, relationship: "Mutual defence" },
  { source: 2, target: 3, relationship: "Intelligence sharing" }
];

let allLinks = [...links]; // canonical link set used by filters

/* ---------- SVG groups ---------- */
const gZoom = svgEl.append("g").attr("class", "zoom-layer");
const linkGroup = gZoom.append("g").attr("class", "links");
const nodeGroup = gZoom.append("g").attr("class", "nodes");

/* ---------- defs (arrowheads) ---------- */
const defs = svgEl.append("defs");
defs.append("marker")
  .attr("id", "arrow")
  .attr("viewBox", "0 -5 10 10")
  .attr("refX", 22)
  .attr("refY", 0)
  .attr("markerWidth", 7)
  .attr("markerHeight", 7)
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,-5L10,0L0,5")
  .attr("fill", "#999");

/* ---------- zoom & pan ---------- */
const zoom = d3.zoom()
  .scaleExtent([0.2, 3])
  .on("zoom", (event) => gZoom.attr("transform", event.transform));

svgEl.call(zoom);

/* ---------- simulation ---------- */
const sim = d3.forceSimulation()
  .force("link", d3.forceLink().id(d => d.id).distance(140))
  .force("charge", d3.forceManyBody().strength(-420))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .force("collision", d3.forceCollide().radius(28));

/* ---------- CSV loader (optional) ---------- */
async function tryLoadCSV() {
  try {
    const nResp = await d3.csv("data/nodes.csv");
    const eResp = await d3.csv("data/edges.csv");

    if (nResp && nResp.length) {
      nodes = nResp.map(d => ({
        id: +d.id,
        label: (d.label || "").trim(),
        group: (d.group || "").trim(),
        fields: JSON.parse(d.fields || "{}")
      }));
    }

    if (eResp && eResp.length) {
      links = eResp.map(d => ({
        source: +d.from,
        target: +d.to,
        relationship: (d.relationship || "").trim()
      }));
      allLinks = [...links];
    }
  } catch (err) {
    // no CSVs — use built-in sample data
    console.warn("CSV load failed or not present — using built-in sample data.");
  }
}

/* ---------- update / render ---------- */
function update() {
  // LINKS: key by numeric source-target
  const linkSel = linkGroup.selectAll(".link")
    .data(links, d => `${typeof d.source === "object" ? d.source.id : d.source}-${typeof d.target === "object" ? d.target.id : d.target}`);

  linkSel.exit().transition().duration(150).style("opacity", 0).remove();

  const linkEnter = linkSel.enter()
    .append("path")
    .attr("class", "link")
    .attr("marker-end", "url(#arrow)")
    .style("opacity", 0);

  linkEnter.transition().duration(200).style("opacity", 1);

  linkEnter.merge(linkSel)
    .attr("stroke", "#9aa4b2")
    .attr("stroke-width", 1.6)
    .attr("fill", "none");

  // NODES
  const nodeSel = nodeGroup.selectAll(".node")
    .data(nodes, d => d.id);

  nodeSel.exit().transition().duration(150).style("opacity", 0).remove();

  const nodeEnter = nodeSel.enter()
    .append("g")
    .attr("class", "node")
    .style("opacity", 0)
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended)
    );

  nodeEnter.append("circle")
    .attr("r", 1e-6)
    .style("stroke", "#fff")
    .style("stroke-width", 1.6)
    .style("fill", d => colorMap[d.group] || "#999")
    .transition().duration(250).attr("r", 16);

  nodeEnter.append("text")
    .attr("x", 22)
    .attr("y", 6)
    .text(d => d.label)
    .style("font-size", "13px")
    .style("fill", "#111");

  nodeEnter.transition().duration(250).style("opacity", 1);

  // merge for node updates (so labels/colors change if node edited)
  nodeEnter.merge(nodeSel).select("circle").style("fill", d => colorMap[d.group] || "#999");
  nodeEnter.merge(nodeSel).select("text").text(d => d.label);

  // update simulation
  sim.nodes(nodes);
  sim.force("link").links(links);
  sim.alpha(0.8).restart();
}

/* ---------- tick handler (clamp inside bounds) ---------- */
sim.on("tick", () => {
  for (const d of nodes) {
    d.x = Math.max(18, Math.min(width - 18, d.x));
    d.y = Math.max(18, Math.min(height - 18, d.y));
  }

  linkGroup.selectAll(".link")
    .attr("d", d => {
      const s = typeof d.source === "object" ? d.source : nodes.find(n => n.id === d.source);
      const t = typeof d.target === "object" ? d.target : nodes.find(n => n.id === d.target);
      if (!s || !t) return null;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 1.2;
      return `M${s.x},${s.y} A${dr},${dr} 0 0,1 ${t.x},${t.y}`;
    });

  nodeGroup.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
});

/* ---------- drag handlers ---------- */
function dragstarted(event, d) {
  if (!event.active) sim.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) {
  d.fx = Math.max(18, Math.min(width - 18, event.x));
  d.fy = Math.max(18, Math.min(height - 18, event.y));
}
function dragended(event, d) {
  if (!event.active) sim.alphaTarget(0);
  d.fx = null; d.fy = null;
}

/* ---------- interactions ---------- */
function attachNodeEvents() {
  nodeGroup.selectAll(".node")
    .on("mouseover", (event, d) => {
      tooltip.style("display", "block").html(`<strong>${d.label}</strong><div class="muted">${d.group}</div>`);
    })
    .on("mousemove", (event) => {
      tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY + 12) + "px");
    })
    .on("mouseout", () => tooltip.style("display", "none"))
    .on("click", (event, d) => {
      highlightNeighbors(d);
      openNodePage(d);
      event.stopPropagation();
    });
}

function highlightNeighbors(node) {
  const connected = new Set();
  links.forEach(l => {
    const sId = typeof l.source === "object" ? l.source.id : l.source;
    const tId = typeof l.target === "object" ? l.target.id : l.target;
    if (sId === node.id) connected.add(tId);
    if (tId === node.id) connected.add(sId);
  });

  nodeGroup.selectAll(".node").select("circle")
    .style("opacity", d => (d.id === node.id || connected.has(d.id)) ? 1 : 0.12);

  linkGroup.selectAll(".link")
    .style("opacity", l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return (s === node.id || t === node.id) ? 1 : 0.06;
    });
}

function clearHighlight() {
  nodeGroup.selectAll(".node").select("circle").style("opacity", 1);
  linkGroup.selectAll(".link").style("opacity", 1);
  closeNodePage();
}

svgEl.on("click", () => clearHighlight());

/* ---------- node details page ---------- */
const nodePage = document.getElementById("nodePage");
const nodePageTitle = document.getElementById("nodePageTitle");
const nodePageSubtitle = document.getElementById("nodePageSubtitle");
const nodePageContent = document.getElementById("nodePageContent");
const btnCloseNodePage = document.getElementById("closeNodePage");
const btnSaveNodePage = document.getElementById("saveNodePage");
let activeNode = null;

function openNodePage(node) {
  activeNode = node;
  nodePageTitle.textContent = node.label;
  nodePageSubtitle.textContent = node.group;
  renderNodePageContent(node);
  nodePage.style.display = "flex";
  nodePage.setAttribute("aria-hidden", "false");
  sim.alphaTarget(0.1).restart();
}

function closeNodePage() {
  activeNode = null;
  nodePage.style.display = "none";
  nodePage.setAttribute("aria-hidden", "true");
  sim.alphaTarget(0);
}

btnCloseNodePage.addEventListener("click", closeNodePage);

btnSaveNodePage.addEventListener("click", () => {
  if (!activeNode) return;
  const form = nodePageContent.querySelector("form");
  if (!form) return;

  activeNode.label = form.querySelector("[name='label']").value.trim() || activeNode.label;
  activeNode.group = form.querySelector("[name='group']").value.trim() || activeNode.group;

  const dynInputs = form.querySelectorAll("[data-field]");
  dynInputs.forEach(inp => {
    activeNode.fields = activeNode.fields || {};
    activeNode.fields[inp.dataset.field] = inp.value;
  });

  update();
  attachNodeEvents();
  if (activeNode) renderNodePageContent(activeNode);
  btnSaveNodePage.textContent = "Saved";
  setTimeout(() => btnSaveNodePage.textContent = "Save", 900);
});

function renderNodePageContent(node) {
  nodePageContent.innerHTML = "";
  const form = document.createElement("form");

  // label
  const fLabel = document.createElement("div");
  fLabel.className = "node-field";
  fLabel.innerHTML = `<label>Label</label><input name="label" value="${escapeHtml(node.label)}"/>`;
  form.appendChild(fLabel);

  // group
  const fGroup = document.createElement("div");
  fGroup.className = "node-field";
  fGroup.innerHTML = `<label>Group</label><input name="group" value="${escapeHtml(node.group)}"/>`;
  form.appendChild(fGroup);

  // dynamic fields (notes or existing fields)
  const keys = Object.keys(node.fields || {});
  if (keys.length === 0) {
    const hint = document.createElement("div");
    hint.className = "node-field";
    hint.innerHTML = `<label>Notes</label><textarea name="notes" data-field="notes" rows="4">${escapeHtml(node.fields && node.fields.notes || "")}</textarea>`;
    form.appendChild(hint);
    node.fields = node.fields || {};
    node.fields.notes = node.fields.notes || "";
  } else {
    keys.forEach(k => {
      const wrapper = document.createElement("div");
      wrapper.className = "node-field";
      const val = node.fields[k] == null ? "" : node.fields[k];
      if (String(val).includes("\n") || String(val).length > 80) {
        wrapper.innerHTML = `<label>${escapeHtml(capitalize(k))}</label><textarea data-field="${escapeHtml(k)}" rows="4">${escapeHtml(val)}</textarea>`;
      } else {
        wrapper.innerHTML = `<label>${escapeHtml(capitalize(k))}</label><input type="text" data-field="${escapeHtml(k)}" value="${escapeHtml(val)}"/>`;
      }
      form.appendChild(wrapper);
    });
  }

  nodePageContent.appendChild(form);
}

/* ---------- helpers ---------- */
function capitalize(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function escapeHtml(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

/* ---------- filtering ---------- */
function applyFilter(filter) {
  if (filter === "all") {
    links = [...allLinks];
    update(); attachNodeEvents();
    return;
  }

  links = allLinks.filter(l => {
    const s = nodes.find(n => n.id === (typeof l.source === "object" ? l.source.id : l.source));
    const t = nodes.find(n => n.id === (typeof l.target === "object" ? l.target.id : l.target));
    return (s && s.group === filter) || (t && t.group === filter);
  });

  update();
  attachNodeEvents();
}

/* ---------- STAC API ---------- */
window.STAC = {
  getNode: id => nodes.find(n => n.id === id),
  updateNode: (id, data) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    Object.assign(node, data);
    update(); attachNodeEvents();
    if (activeNode && activeNode.id === id) renderNodePageContent(node);
  }
};

/* ---------- UI bindings (all cleanly closed) ---------- */
function bindUI() {
  document.getElementById("addNodeBtn").addEventListener("click", () => {
    const label = document.getElementById("nodeLabel").value.trim();
    const group = document.getElementById("nodeGroup").value;
    if (!label) { alert("Provide a node label"); return; }
    const newId = nodes.length ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
    nodes.push({ id: newId, label, group, fields: {} });
    update(); attachNodeEvents();
  });

  document.getElementById("addLinkBtn").addEventListener("click", () => {
    const sLabel = document.getElementById("linkSource").value.trim();
    const tLabel = document.getElementById("linkTarget").value.trim();
    const rel = document.getElementById("linkType").value.trim() || "";
    if (!sLabel || !tLabel) { alert("Source and target labels required"); return; }
    const sNode = nodes.find(n => n.label === sLabel);
    const tNode = nodes.find(n => n.label === tLabel);
    if (!sNode || !tNode) { alert("Source or target node not found"); return; }
    links.push({ source: sNode.id, target: tNode.id, relationship: rel });
    allLinks = [...links]; // keep canonical list current
    update(); attachNodeEvents();
  });

  document.querySelectorAll(".filter").forEach(btn => {
    btn.addEventListener("click", () => applyFilter(btn.getAttribute("data-filter")));
  });

  document.getElementById("exportJson").addEventListener("click", () => {
    downloadJSON({ nodes, links }, "stac-network.json");
  });

  document.getElementById("importJson").addEventListener("change", async (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      if (obj.nodes && obj.links) {
        nodes = obj.nodes.map(n => ({ ...n }));
        links = obj.links.map(l => ({ ...l }));
        allLinks = [...links];
        update(); attachNodeEvents();
      } else alert("Invalid file: expected {nodes,links}");
    } catch {
      alert("Invalid JSON");
    }
    evt.target.value = "";
  });

  document.getElementById("saveLocal").addEventListener("click", () => {
    localStorage.setItem("stac_network", JSON.stringify({ nodes, links }));
    alert("Saved to localStorage");
  });

  document.getElementById("loadLocal").addEventListener("click", () => {
    const raw = localStorage.getItem("stac_network");
    if (!raw) { alert("No saved network in localStorage"); return; }
    const obj = JSON.parse(raw);
    nodes = obj.nodes; links = obj.links; allLinks = [...links];
    update(); attachNodeEvents();
  });

  document.getElementById("downloadPNG").addEventListener("click", async () => {
    try { await downloadPNGFromSVG(svgEl.node(), width, height, "stac-network.png"); }
    catch { alert("PNG export failed"); }
  });

  document.getElementById("resetNetwork").addEventListener("click", () => {
    if (!confirm("Reset network?")) return;
    nodes = []; links = []; allLinks = [];
    update(); attachNodeEvents();
  });

  window.addEventListener("resize", () => {
    width = window.innerWidth - sidebarWidth - 36;
    height = window.innerHeight - 36;
    svgEl.attr("width", width).attr("height", height);
    sim.force("center", d3.forceCenter(width / 2, height / 2));
    sim.alpha(0.3).restart();
  });
}

/* ---------- init ---------- */
(async function init() {
  await tryLoadCSV();
  update();
  attachNodeEvents();
  bindUI();
})();
