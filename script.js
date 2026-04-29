const WORLD_GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const LOCAL_DATA_URL = "./met_objects_sample.json?v=3";
const MET_OBJECT_API_URL = "https://collectionapi.metmuseum.org/public/collection/v1/objects/";

const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");
const periodFilterEl = document.getElementById("periodFilter");
const reloadBtn = document.getElementById("reloadBtn");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const artifactPanelsSectionEl = document.getElementById("artifactPanelsSection");
const artifactPanelsEl = document.getElementById("artifactPanels");
const artifactPanelsEmptyEl = document.getElementById("artifactPanelsEmpty");

let worldFeatures = [];
let allRecords = [];
let countryPath;
let currentFilteredRecords = [];
let selectedCountry = "";
const imageUrlCache = new Map();
let artifactPanelRenderId = 0;

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
  currentFilteredRecords = records;

  const counts = d3.rollup(records, (v) => v.length, (d) => normalizeCountry(d.country));
  const maxCount = d3.max(Array.from(counts.values())) || 1;
  const colorMax = Math.max(maxCount, 2);
  const color = d3.scaleSequentialLog().domain([1, colorMax]).interpolator(d3.interpolateYlOrRd);

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
    .on("click", (event, d) => {
      event.stopPropagation();
      selectedCountry = normalizeCountry(d.properties.name || "");
      renderArtifactPanels(selectedCountry, counts.get(selectedCountry) || 0);
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  drawLegend(color, colorMax);
  statsEl.textContent = `Usable records: ${records.length} | Countries represented: ${counts.size}`;

  if (selectedCountry) {
    renderArtifactPanels(selectedCountry, counts.get(selectedCountry) || 0);
  } else {
    clearArtifactPanels();
  }
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
  const minCount = 1;
  const logMin = Math.log(minCount);
  const logMax = Math.log(maxCount);

  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const value = Math.exp(logMin + t * (logMax - logMin));
    legend
      .append("rect")
      .attr("x", (i * legendWidth) / steps)
      .attr("y", 0)
      .attr("width", legendWidth / steps)
      .attr("height", legendHeight)
      .attr("fill", colorScale(value));
  }

  const axisScale = d3.scaleLog().domain([minCount, maxCount]).range([0, legendWidth]);
  const axis = d3.axisBottom(axisScale).ticks(4, ",");

  legend.append("g").attr("transform", `translate(0, ${legendHeight})`).call(axis);
  legend.append("text").attr("x", 0).attr("y", -4).text("Artifacts count (log)");
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

function clearArtifactPanels() {
  artifactPanelsSectionEl.hidden = false;
  artifactPanelsEl.innerHTML = "";
  artifactPanelsEmptyEl.textContent = "Click a country on the map to view up to five artifacts.";
  artifactPanelsEmptyEl.hidden = false;
}

async function renderArtifactPanels(countryName, count) {
  const renderId = ++artifactPanelRenderId;
  artifactPanelsSectionEl.hidden = false;
  artifactPanelsEl.innerHTML = "";

  // Update the heading to show the selected country name
  const headingEl = document.getElementById("artifactPanelsHeading");
  if (headingEl) {
    if (countryName && count > 0) {
      headingEl.textContent = `${countryName} Artifacts`;
    } else {
      headingEl.textContent = "Selected Country Artifacts";
    }
  }

  if (!countryName || count === 0) {
    artifactPanelsEmptyEl.textContent = `No artifacts available for ${countryName || "this country"} in the selected period.`;
    artifactPanelsEmptyEl.hidden = false;
    return;
  }

  const countryArtifacts = currentFilteredRecords.filter((d) => normalizeCountry(d.country) === countryName);
  const artifacts = await selectTopArtifacts(countryArtifacts, 5);

  if (renderId !== artifactPanelRenderId) {
    return;
  }

  if (artifacts.length === 0) {
    artifactPanelsEmptyEl.textContent = `No artifacts available for ${countryName} in the selected period.`;
    artifactPanelsEmptyEl.hidden = false;
    return;
  }

  artifactPanelsEmptyEl.hidden = true;

  artifacts.forEach((artifact) => {
    const card = document.createElement("article");
    card.className = "artifact-card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "artifact-image-wrap";
    const imageUrl = getKnownImageUrl(artifact);
    const objectId = Number(artifact.objectID);
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = artifact.title ? `Artifact image: ${artifact.title}` : "Artifact image";
      img.loading = "lazy";
      img.onerror = () => {
        imgWrap.innerHTML = '<span class="artifact-no-image">Image unavailable</span>';
      };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = '<span class="artifact-no-image">Searching for image...</span>';
      if (Number.isFinite(objectId) && objectId > 0) {
        hydrateImageFromApi(objectId, imgWrap, artifact.title);
      }
    }

    const content = document.createElement("div");
    content.className = "artifact-content";
    const title = artifact.title || artifact.objectName || "Untitled artifact";
    const artist = artifact.artistDisplayName || artifact.artist || "Unknown maker";
    const date = artifact.objectDate || artifact.objectBeginDate || "Date unknown";
    const medium = artifact.medium || artifact.classification || "Medium unknown";
    content.innerHTML = `
      <h3 class="artifact-title">${escapeHtml(title)}</h3>
      <p class="artifact-meta"><strong>Artist:</strong> ${escapeHtml(String(artist))}</p>
      <p class="artifact-meta"><strong>Date:</strong> ${escapeHtml(String(date))}</p>
      <p class="artifact-meta"><strong>Medium:</strong> ${escapeHtml(String(medium))}</p>
    `;

    card.appendChild(imgWrap);
    card.appendChild(content);
    artifactPanelsEl.appendChild(card);
  });
}

async function selectTopArtifacts(artifacts, maxCount) {
  const withImages = [];
  const withoutImages = [];

  artifacts.forEach((artifact) => {
    if (artifactHasImage(artifact)) {
      withImages.push(artifact);
    } else {
      withoutImages.push(artifact);
    }
  });

  if (withImages.length < maxCount && withoutImages.length > 0) {
    const needed = maxCount - withImages.length;
    await prefetchImagesForArtifacts(withoutImages, needed, 40);
  }

  const prioritizedWithImages = [];
  const prioritizedWithoutImages = [];
  artifacts.forEach((artifact) => {
    if (artifactHasImage(artifact)) prioritizedWithImages.push(artifact);
    else prioritizedWithoutImages.push(artifact);
  });

  return prioritizedWithImages.concat(prioritizedWithoutImages).slice(0, maxCount);
}

function artifactHasImage(artifact) {
  if (!artifact) return false;
  if (artifact.primaryImageSmall || artifact.primaryImage || artifact.image) return true;

  const objectId = Number(artifact.objectID);
  if (!Number.isFinite(objectId) || objectId <= 0) return false;

  if (imageUrlCache.get(objectId)) return true;
  return Boolean(window.localStorage.getItem(`met-image-${objectId}`));
}

async function hydrateImageFromApi(objectId, imageWrapEl, artifactTitle) {
  try {
    const apiImageUrl = await fetchImageUrlByObjectId(objectId);
    if (!apiImageUrl) {
      imageWrapEl.innerHTML = '<span class="artifact-no-image">No image available</span>';
      return;
    }
    renderImageElement(imageWrapEl, apiImageUrl, artifactTitle);
  } catch (error) {
    console.error(`Unable to fetch image for objectID ${objectId}`, error);
  }
}

function getKnownImageUrl(artifact) {
  if (!artifact) return "";
  if (artifact.primaryImageSmall || artifact.primaryImage || artifact.image) {
    return artifact.primaryImageSmall || artifact.primaryImage || artifact.image;
  }
  const objectId = Number(artifact.objectID);
  if (!Number.isFinite(objectId) || objectId <= 0) return "";
  return imageUrlCache.get(objectId) || window.localStorage.getItem(`met-image-${objectId}`) || "";
}

async function prefetchImagesForArtifacts(artifacts, neededCount, scanLimit) {
  let found = 0;
  const candidates = artifacts.slice(0, scanLimit);
  for (const artifact of candidates) {
    if (found >= neededCount) break;
    const hasImage = await prefetchImageForArtifact(artifact);
    if (hasImage) found += 1;
  }
}

async function prefetchImageForArtifact(artifact) {
  if (artifactHasImage(artifact)) return true;
  const objectId = Number(artifact.objectID);
  if (!Number.isFinite(objectId) || objectId <= 0) return false;
  const imageUrl = await fetchImageUrlByObjectId(objectId);
  return Boolean(imageUrl);
}

async function fetchImageUrlByObjectId(objectId) {
  const cachedUrl = imageUrlCache.get(objectId);
  if (cachedUrl) return cachedUrl;

  const storageKey = `met-image-${objectId}`;
  const localCachedUrl = window.localStorage.getItem(storageKey);
  if (localCachedUrl) {
    imageUrlCache.set(objectId, localCachedUrl);
    return localCachedUrl;
  }

  const response = await fetch(`${MET_OBJECT_API_URL}${objectId}`);
  if (!response.ok) return "";
  const payload = await response.json();
  const apiImageUrl = payload.primaryImageSmall || payload.primaryImage || "";
  if (!apiImageUrl) return "";
  imageUrlCache.set(objectId, apiImageUrl);
  window.localStorage.setItem(storageKey, apiImageUrl);
  return apiImageUrl;
}

function renderImageElement(imageWrapEl, imageUrl, artifactTitle) {
  if (!imageUrl) return;
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = artifactTitle ? `Artifact image: ${artifactTitle}` : "Artifact image";
  img.loading = "lazy";
  img.onerror = () => {
    imageWrapEl.innerHTML = '<span class="artifact-no-image">Image unavailable</span>';
  };
  imageWrapEl.innerHTML = "";
  imageWrapEl.appendChild(img);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
