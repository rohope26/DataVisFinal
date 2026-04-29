const LOCAL_DATA_URL = "./met_objects_sample.json?v=2";
const US_COUNTRY_NAME = "United States of America";

const countryFilterEl = document.getElementById("countryCompareFilter");
const statusEl = document.getElementById("compareStatus");
const chartEl = d3.select("#comparisonChart");

let allRecords = [];

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
  resizeChart();
  window.addEventListener("resize", () => {
    resizeChart();
    if (allRecords.length > 0) {
      renderChart(countryFilterEl.value);
    }
  });
  countryFilterEl.addEventListener("change", () => renderChart(countryFilterEl.value));
  await loadLocalData();
}

async function loadLocalData() {
  setStatus("Loading local data file...");
  allRecords = [];

  try {
    const payload = await d3.json(LOCAL_DATA_URL);
    if (!payload || !Array.isArray(payload.records) || payload.records.length === 0) {
      setStatus("No records found in met_objects_sample.json.");
      return;
    }

    allRecords = payload.records.filter((d) => d && d.country);
    populateCountryOptions(allRecords);
    setStatus(`Loaded ${allRecords.length} records. Choose a country to compare.`);
    renderChart(countryFilterEl.value);
  } catch (error) {
    console.error(error);
    setStatus("Error loading met_objects_sample.json.");
  }
}

function populateCountryOptions(records) {
  const countryCounts = d3.rollup(records, (v) => v.length, (d) => normalizeCountry(d.country));
  const countries = Array.from(countryCounts.keys())
    .filter(Boolean)
    .sort((a, b) => d3.ascending(a, b));

  countryFilterEl.innerHTML = "";
  countries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    countryFilterEl.appendChild(option);
  });

  if (countries.includes(US_COUNTRY_NAME)) {
    countryFilterEl.value = US_COUNTRY_NAME;
  } else if (countries.length > 0) {
    countryFilterEl.value = countries[0];
  }
}

function renderChart(selectedCountry) {
  const normalizedRecords = allRecords.map((d) => ({ ...d, normalizedCountry: normalizeCountry(d.country) }));
  const totalCount = normalizedRecords.length;
  const usCount = normalizedRecords.filter((d) => d.normalizedCountry === US_COUNTRY_NAME).length;
  const selectedCount = normalizedRecords.filter((d) => d.normalizedCountry === selectedCountry).length;

  let bars = [];
  if (selectedCountry === US_COUNTRY_NAME) {
    bars = [
      { label: "United States", value: usCount, color: "#4472c4" },
      { label: "Rest of World", value: totalCount - usCount, color: "#ed7d31" }
    ];
  } else {
    const restCount = totalCount - usCount - selectedCount;
    bars = [
      { label: "United States", value: usCount, color: "#4472c4" },
      { label: selectedCountry, value: selectedCount, color: "#70ad47" },
      { label: "Rest of World", value: restCount, color: "#ed7d31" }
    ];
  }

  drawBars(bars, totalCount, selectedCountry);
}

function drawBars(data, totalCount, selectedCountry) {
  const width = chartEl.node().viewBox.baseVal.width;
  const height = chartEl.node().viewBox.baseVal.height;
  const margin = { top: 25, right: 25, bottom: 55, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  chartEl.selectAll("*").remove();
  const g = chartEl.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.label))
    .range([0, innerWidth])
    .padding(0.3);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.value) || 1])
    .nice()
    .range([innerHeight, 0]);

  g.append("g").attr("transform", `translate(0, ${innerHeight})`).call(d3.axisBottom(x));
  g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(",")));

  g.selectAll(".compare-bar")
    .data(data)
    .join("rect")
    .attr("class", "compare-bar")
    .attr("x", (d) => x(d.label))
    .attr("y", (d) => y(d.value))
    .attr("width", x.bandwidth())
    .attr("height", (d) => innerHeight - y(d.value))
    .attr("fill", (d) => d.color);

  g.selectAll(".compare-value")
    .data(data)
    .join("text")
    .attr("class", "compare-value")
    .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.value) - 8)
    .attr("text-anchor", "middle")
    .text((d) => `${d3.format(",")(d.value)} (${d3.format(".1%")(d.value / totalCount)})`);

  chartEl
    .append("text")
    .attr("class", "compare-title")
    .attr("x", 24)
    .attr("y", 18)
    .text(`Origin comparison for ${selectedCountry}`);
}

function resizeChart() {
  const container = document.querySelector(".comparison-card");
  const width = container ? container.clientWidth : 1000;
  chartEl.attr("viewBox", `0 0 ${width} 450`);
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
