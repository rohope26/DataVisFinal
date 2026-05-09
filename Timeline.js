/**
 * timeline.js  — Density heatmap timeline
 *
 * - Only renders when a country is selected
 * - X axis = time (calibrated to selected country's data)
 * - Color = log-scaled artifact count per bin, blue palette
 * - Hover tooltip on each cell
 */

(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────────────────────────
  const CELL_HEIGHT    = 36;
  const MIN_CELL_W     = 6;
  const AXIS_HEIGHT    = 36;  // x-axis below heatmap
  const LEGEND_HEIGHT  = 34;  // gradient bar + numeric axis below x-axis
  const PADDING_LEFT   = 52;
  const PADDING_RIGHT  = 20;
  const PADDING_TOP    = 14;
  const TARGET_BINS    = 60;

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const svgEl     = document.getElementById("timelineSvg");
  const ttEl      = document.getElementById("timelineTooltip");
  const headingEl = document.getElementById("timelineHeading");
  const subEl     = document.getElementById("timelineSub");
  const resetBtn  = document.getElementById("timelineResetBtn");
  const sectionEl = document.getElementById("timelineSection");

  const svg = d3.select(svgEl);

  // Hide section on load — only visible when a country is selected
  sectionEl.hidden = true;

  // ── Reset button ─────────────────────────────────────────────────────────────
  resetBtn.addEventListener("click", () => {
    if (typeof clearSelectedCountry === "function") clearSelectedCountry();
    sectionEl.hidden = true;
    if (typeof updateMapWithFilters === "function") updateMapWithFilters();
    Timeline.update([], "");
  });

  // ── Public entry point ───────────────────────────────────────────────────────
  function update(records, countryName) {
    if (!countryName) {
      sectionEl.hidden = true;
      return;
    }

    const countryRecords = (records || []).filter(
      r => normalizeCountry(r.country) === countryName
    );

    if (!countryRecords.length) {
      sectionEl.hidden = true;
      return;
    }

    sectionEl.hidden = false;
    resetBtn.hidden  = false;

    headingEl.textContent = `${countryName} — Artifact Density Timeline`;
    subEl.textContent = `${countryRecords.length.toLocaleString()} artifact${countryRecords.length !== 1 ? "s" : ""}. Each cell shows artifact count per time bin (log-scaled color).`;

    render(countryRecords);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render(records) {
    svg.selectAll("*").remove();
    ttEl.style.display = "none";

    // ── Date domain calibrated to this country's data ──────────────────────
    const dates   = records.map(r => r.midDate ?? r.objectBeginDate);
    let domainMin = d3.min(dates);
    let domainMax = d3.max(dates);

    domainMin = Math.floor(domainMin / 100) * 100;
    domainMax = Math.ceil(domainMax  / 100) * 100;
    if (domainMin === domainMax) domainMax = domainMin + 100;

    // ── Layout ─────────────────────────────────────────────────────────────
    const containerW = svgEl.parentElement.clientWidth || 900;
    const plotW      = containerW - PADDING_LEFT - PADDING_RIGHT;

    // Pick a bin size that's a round number and gives ~TARGET_BINS cells
    const span    = domainMax - domainMin;
    let   binSize = Math.ceil(span / TARGET_BINS);
    const NICE    = [1, 5, 10, 25, 50, 100, 200, 250, 500, 1000];
    binSize = NICE.find(n => n >= binSize) || 1000;

    const bins    = d3.range(domainMin, domainMax, binSize);
    const numBins = bins.length;
    const cellW   = Math.max(MIN_CELL_W, Math.floor(plotW / numBins));

    const svgH = PADDING_TOP + CELL_HEIGHT + AXIS_HEIGHT + LEGEND_HEIGHT;
    svgEl.style.height = svgH + "px";
    svg.attr("viewBox", `0 0 ${containerW} ${svgH}`);

    // ── Bin the data ───────────────────────────────────────────────────────
    const counts = new Map(bins.map(b => [b, 0]));
    records.forEach(r => {
      const d   = r.midDate ?? r.objectBeginDate;
      const idx = Math.min(
        bins.length - 1,
        Math.max(0, Math.floor((d - domainMin) / binSize))
      );
      const key = bins[idx];
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const maxCount = d3.max(Array.from(counts.values())) || 1;

    // ── Log-scaled blue color scale ────────────────────────────────────────
    const colorScale = d3.scaleSequentialLog()
      .domain([1, Math.max(maxCount, 2)])
      .interpolator(d3.interpolateBlues)
      .clamp(true);

    // ── Draw heatmap cells ─────────────────────────────────────────────────
    const g = svg.append("g")
      .attr("class", "tl-heatmap")
      .attr("transform", `translate(${PADDING_LEFT}, ${PADDING_TOP})`);

    bins.forEach((binStart, i) => {
      const count = counts.get(binStart) || 0;
      const fill  = count > 0 ? colorScale(count) : "#edf2fa";

      g.append("rect")
        .attr("class", "tl-cell")
        .attr("role", count > 0 ? "img" : null)
        .attr("tabindex", count > 0 ? 0 : null)
        .attr("aria-label", count > 0 ? getCellLabel(binStart, count, binSize) : null)
        .attr("x",      i * cellW)
        .attr("y",      0)
        .attr("width",  Math.max(1, cellW - 1))
        .attr("height", CELL_HEIGHT)
        .attr("fill",   fill)
        .attr("rx",     2)
        .on("mousemove",  (event) => onCellHover(event, binStart, count, binSize))
        .on("focus", (event) => onCellFocus(event, binStart, count, binSize))
        .on("blur", () => { ttEl.style.display = "none"; })
        .on("mouseleave", ()      => { ttEl.style.display = "none"; });
    });

    // ── X axis ────────────────────────────────────────────────────────────
    const xScale = d3.scaleLinear()
      .domain([domainMin, domainMax])
      .range([0, cellW * numBins]);

    const axisG = svg.append("g")
      .attr("class", "tl-axis")
      .attr("transform", `translate(${PADDING_LEFT}, ${PADDING_TOP + CELL_HEIGHT + 4})`);

    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(10, Math.round((cellW * numBins) / 80)))
      .tickFormat(d => d < 0 ? `${Math.abs(d)} BCE` : `${d} CE`);

    axisG.call(xAxis);
    axisG.select(".domain").attr("stroke", "#9aafc8");
    axisG.selectAll(".tick line").attr("stroke", "#9aafc8");
    axisG.selectAll(".tick text").attr("fill", "#4a5a70").attr("font-size", "11px");

    // ── Legend (top right) ─────────────────────────────────────────────────
    drawLegend(containerW, colorScale, maxCount);
  }

  // ── Legend ───────────────────────────────────────────────────────────────────
  // Sits below the x-axis. Has a gradient bar with a real log-scale numeric axis.
  function drawLegend(containerW, colorScale, maxCount) {
    const legendW  = 180;
    const barH     = 10;
    const steps    = 30;

    // Centre the legend horizontally under the plot area
    const plotW    = containerW - PADDING_LEFT - PADDING_RIGHT;
    const lx       = PADDING_LEFT + (plotW - legendW) / 2;
    // Place it after PADDING_TOP + CELL_HEIGHT + AXIS_HEIGHT
    const ly       = PADDING_TOP + CELL_HEIGHT + AXIS_HEIGHT + 2;

    const lg = svg.append("g")
      .attr("class", "tl-legend")
      .attr("transform", `translate(${lx}, ${ly})`);

    // Label above bar
    lg.append("text")
      .attr("x", legendW / 2)
      .attr("y", -3)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#4a5a70")
      .text("Artifact density (log scale)");

    // Gradient bar
    for (let i = 0; i < steps; i++) {
      const t   = i / (steps - 1);
      const val = Math.exp(t * Math.log(Math.max(maxCount, 2)));
      lg.append("rect")
        .attr("x",      (i * legendW) / steps)
        .attr("y",      0)
        .attr("width",  legendW / steps + 0.5)
        .attr("height", barH)
        .attr("fill",   colorScale(Math.max(1, val)));
    }

    // Numeric axis below the bar — matches the map legend style
    const axisScale = d3.scaleLog()
      .domain([1, Math.max(maxCount, 2)])
      .range([0, legendW]);

    const legendAxis = d3.axisBottom(axisScale)
      .ticks(4, ",")
      .tickSize(3);

    const axG = lg.append("g")
      .attr("transform", `translate(0, ${barH})`)
      .call(legendAxis);

    axG.select(".domain").attr("stroke", "#9aafc8");
    axG.selectAll(".tick line").attr("stroke", "#9aafc8");
    axG.selectAll(".tick text")
      .attr("fill", "#4a5a70")
      .attr("font-size", "10px");
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────────
  function onCellHover(event, binStart, count, binSize) {
    showCellTooltip(event.clientX, event.clientY, binStart, count, binSize);
  }

  function onCellFocus(event, binStart, count, binSize) {
    const rect = event.currentTarget.getBoundingClientRect();
    showCellTooltip(rect.left + rect.width / 2, rect.top, binStart, count, binSize);
  }

  function showCellTooltip(clientX, clientY, binStart, count, binSize) {
    const binEnd   = binStart + binSize - 1;
    const fmtYear  = y => y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;

    ttEl.innerHTML = `
      <strong>${fmtYear(binStart)} – ${fmtYear(binEnd)}</strong>
      <span class="tl-tt-row">🏺 ${count.toLocaleString()} artifact${count !== 1 ? "s" : ""}</span>
    `;

    const wrap      = ttEl.parentElement;
    const wrapRect  = wrap.getBoundingClientRect();
    const mx        = clientX - wrapRect.left;
    const my        = clientY - wrapRect.top;
    const ttW       = 180;
    const left      = mx + ttW + 10 > wrapRect.width ? mx - ttW - 6 : mx + 10;

    ttEl.style.display = "block";
    ttEl.style.left    = `${left}px`;
    ttEl.style.top     = `${my - 40}px`;
  }

  function getCellLabel(binStart, count, binSize) {
    const binEnd = binStart + binSize - 1;
    const fmtYear = y => y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
    return `${fmtYear(binStart)} to ${fmtYear(binEnd)}: ${count.toLocaleString()} artifact${count !== 1 ? "s" : ""}.`;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.Timeline = { update };

})();
