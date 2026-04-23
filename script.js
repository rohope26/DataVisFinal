const WORLD_GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const LOCAL_DATA_URL = "./met_objects_sample.json?v=2";

const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");
const periodFilterEl = document.getElementById("periodFilter");
const reloadBtn = document.getElementById("reloadBtn");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");

let worldFeatures = [];
let allRecords = [];
let countryPath;

const PERIODS = {
  all: () => true,
  ancient: (d) => d.objectBeginDate < 500,
  medieval: (d) => d.objectBeginDate >= 500 && d.objectBeginDate < 1500,
  earlyModern: (d) => d.objectBeginDate >= 1500 && d.objectBeginDate < 1800,
  modern: (d) => d.objectBeginDate >= 1800 && d.objectBeginDate < 1945,
  contemporary: (d) => d.objectBeginDate >= 1945
};

const COUNTRY_NORMALIZATION = {
  usa: "United States of America",
  "united states": "United States of America",
  "u.s.a.": "United States of America",
  "u.s.": "United States of America",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  russia: "Russian Federation",
  czechia: "Czech Republic",
  "republic of korea": "South Korea",
  korea: "South Korea",
  "democratic republic of the congo": "Democratic Republic of the Congo",
  "cote d'ivoire": "Ivory Coast",
  "côte d'ivoire": "Ivory Coast",
  iran: "Iran",
  vietnam: "Vietnam",
  syria: "Syria",
  laos: "Laos",
  bolivia: "Bolivia",
  venezuela: "Venezuela",
  tanzania: "Tanzania",
  moldova: "Moldova",
  palestine: "Palestine",
  "north macedonia": "Macedonia"
};

init();

async function init() {
  resizeSvg();
  await loadWorldMap();
  drawBaseMap();
  wireEvents();
  await loadLocalData();
}

function wireEvents() {
  reloadBtn.addEventListener("click", loadLocalData);
  periodFilterEl.addEventListener("change", updateMapWithFilters);
  window.addEventListener("resize", () => {
    resizeSvg();
    drawBaseMap();
    if (allRecords.length > 0) {
      updateMapWithFilters();
    }
  });
}

function resizeSvg() {
  const container = document.querySelector(".chart-wrap");
  const width = container.clientWidth;
  const height = 650;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
}

async function loadWorldMap() {
  const geojson = await d3.json(WORLD_GEOJSON_URL);
  worldFeatures = geojson.features;
}

function drawBaseMap() {
  const width = svg.node().viewBox.baseVal.width;
  const height = svg.node().viewBox.baseVal.height;

  svg.selectAll("*").remove();
  const projection = d3.geoNaturalEarth1().fitSize([width, height - 30], { type: "FeatureCollection", features: worldFeatures });
  countryPath = d3.geoPath(projection);

  svg
    .append("g")
    .attr("class", "countries")
    .selectAll("path")
    .data(worldFeatures)
    .join("path")
    .attr("class", "country")
    .attr("d", countryPath)
    .attr("fill", "#e0e0e0")
    .append("title")
    .text((d) => d.properties.name || "Unknown");
}

async function loadLocalData() {
  setStatus("Loading local data file...");
  statsEl.textContent = "";
  allRecords = [];

  try {
    const payload = await d3.json(LOCAL_DATA_URL);
    if (!payload || !Array.isArray(payload.records) || payload.records.length === 0) {
      setStatus("No records found in met_objects_sample.json.");
      return;
    }

    allRecords = payload.records.filter((d) => d && d.country && Number.isFinite(d.objectBeginDate));
    setStatus("Local data loaded. Apply period filter to explore.");
    updateMapWithFilters();
  } catch (error) {
    console.error(error);
    setStatus("Error loading met_objects_sample.json.");
  }
}

function updateMapWithFilters() {
  const period = periodFilterEl.value;
  const filterFn = PERIODS[period] || PERIODS.all;
  const records = allRecords.filter(filterFn);

  const counts = d3.rollup(records, (v) => v.length, (d) => normalizeCountry(d.country));
  const maxCount = d3.max(Array.from(counts.values())) || 1;
  const color = d3.scaleSequential().domain([0, maxCount]).interpolator(d3.interpolateYlOrRd);

  svg
    .select(".countries")
    .selectAll("path")
    .attr("fill", (d) => {
      const countryName = normalizeCountry(d.properties.name || "");
      const value = counts.get(countryName) || 0;
      return value > 0 ? color(value) : "#eceff5";
    })
    .on("mousemove", (event, d) => {
      const countryName = normalizeCountry(d.properties.name || "");
      const value = counts.get(countryName) || 0;
      tooltip
        .style("display", "block")
        .style("left", `${event.offsetX}px`)
        .style("top", `${event.offsetY}px`)
        .html(`<strong>${d.properties.name || "Unknown"}</strong><br/>Artifacts: ${value}`);
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  drawLegend(color, maxCount);
  statsEl.textContent = `Usable records: ${records.length} | Countries represented: ${counts.size}`;
}

function drawLegend(colorScale, maxCount) {
  svg.selectAll(".legend").remove();

  const width = svg.node().viewBox.baseVal.width;
  const legendWidth = 240;
  const legendHeight = 10;
  const x = width - legendWidth - 20;
  const y = 18;

  const legend = svg.append("g").attr("class", "legend").attr("transform", `translate(${x}, ${y})`);

  const steps = 30;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const value = t0 * maxCount;
    legend
      .append("rect")
      .attr("x", (i * legendWidth) / steps)
      .attr("y", 0)
      .attr("width", legendWidth / steps)
      .attr("height", legendHeight)
      .attr("fill", colorScale(value));
  }

  const axisScale = d3.scaleLinear().domain([0, maxCount]).range([0, legendWidth]);
  const axis = d3.axisBottom(axisScale).ticks(4).tickFormat(d3.format("d"));

  legend.append("g").attr("transform", `translate(0, ${legendHeight})`).call(axis);
  legend.append("text").attr("x", 0).attr("y", -4).text("Artifacts count");
}

function normalizeCountry(value) {
  if (!value) return "";
  const cleaned = String(value).trim();
  const lowered = cleaned.toLowerCase();
  return COUNTRY_NORMALIZATION[lowered] || cleaned;
}

function setStatus(text) {
  statusEl.textContent = text;
}
