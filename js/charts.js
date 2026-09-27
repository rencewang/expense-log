// Small inline-SVG chart primitives. No library: each function returns an
// <svg> element drawn in currentColor, so charts follow the page's text
// color and font. Labels are set with textContent, never parsed as markup.
//
// Every chart takes plain numbers. Callers format values for display by
// passing `format` (for example, cents => money.format(cents / 100)).

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 600;
const FONT_SIZE = 12;

// Series and slice styles. The palette is monochrome, so series differ by
// dash pattern and slices by opacity.
const DASHES = ["", "6 4", "2 3", "10 3 2 3"];
const OPACITIES = [1, 0.75, 0.55, 0.4, 0.28, 0.18, 0.1];

function svg(tag, attributes = {}, text) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

function frame(height, label) {
  return svg("svg", {
    viewBox: `0 0 ${WIDTH} ${height}`,
    width: "100%",
    role: "img",
    "aria-label": label,
    fill: "currentColor",
    "font-size": FONT_SIZE,
    style: "display: block; height: auto; overflow: visible",
  });
}

// Hover text for a shape, read by screen readers inside role="img".
function tooltip(element, text) {
  element.append(svg("title", {}, text));
  return element;
}

const identity = (value) => String(value);

// Keeps the largest `max - 1` entries and sums the rest into one entry.
// Use before pieChart so it never has more slices than can be told apart.
export function groupSmallest(entries, max = 6, otherLabel = "Other") {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const kept = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((sum, entry) => sum + entry.value, 0);
  return [...kept, { label: otherLabel, value: rest }];
}

// Vertical bars. `bars` is [{ label, value }]. Labels sit under each bar;
// pass `labelEvery` to show only every nth label when bars are dense.
export function barChart(bars, { label = "Bar chart", height = 200, format = identity, labelEvery = 1 } = {}) {
  const chart = frame(height, label);
  const top = 4;
  const bottom = FONT_SIZE + 8;
  const plot = height - top - bottom;
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  const slot = WIDTH / Math.max(1, bars.length);
  const gap = Math.min(4, slot * 0.2);

  bars.forEach((bar, index) => {
    const barHeight = max > 0 ? (bar.value / max) * plot : 0;
    const x = index * slot + gap / 2;
    chart.append(
      tooltip(
        svg("rect", {
          x,
          y: top + plot - barHeight,
          width: slot - gap,
          height: barHeight,
        }),
        `${bar.label}: ${format(bar.value)}`,
      ),
    );
    if (index % labelEvery === 0) {
      chart.append(
        svg("text", { x: x + (slot - gap) / 2, y: height - 2, "text-anchor": "middle" }, bar.label),
      );
    }
  });

  chart.append(svg("line", { x1: 0, x2: WIDTH, y1: top + plot, y2: top + plot, stroke: "currentColor" }));
  return chart;
}

// Horizontal bars with the label on the left and the value on the right.
// Easier to read than a pie once there are more than a few categories.
export function horizontalBars(rows, { label = "Bar chart", format = identity, rowHeight = 22 } = {}) {
  const height = rows.length * rowHeight;
  const chart = frame(height, label);
  const labelWidth = 150;
  const valueWidth = 90;
  const plot = WIDTH - labelWidth - valueWidth;
  const max = Math.max(0, ...rows.map((row) => row.value));

  rows.forEach((row, index) => {
    const y = index * rowHeight;
    const middle = y + rowHeight / 2 + FONT_SIZE / 3;
    chart.append(
      svg("text", { x: 0, y: middle }, row.label),
      tooltip(
        svg("rect", {
          x: labelWidth,
          y: y + 4,
          width: max > 0 ? (row.value / max) * plot : 0,
          height: rowHeight - 8,
        }),
        `${row.label}: ${format(row.value)}`,
      ),
      svg("text", { x: WIDTH, y: middle, "text-anchor": "end" }, format(row.value)),
    );
  });

  return chart;
}

// Lines on a shared numeric x axis. `series` is
// [{ name, points: [{ x, y }] }]; series are told apart by dash pattern and
// a legend is drawn when there is more than one. `xLabels` is optional
// [{ x, label }] for axis ticks.
export function lineChart(series, { label = "Line chart", height = 200, format = identity, xLabels = [] } = {}) {
  const chart = frame(height, label);
  const legend = series.length > 1 ? FONT_SIZE + 10 : 0;
  const top = legend + 4;
  const bottom = FONT_SIZE + 8;
  const left = 2;
  const right = 2;
  const plotHeight = height - top - bottom;
  const plotWidth = WIDTH - left - right;

  const points = series.flatMap((line) => line.points);
  const xs = [...points.map((point) => point.x), ...xLabels.map((tick) => tick.x)];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(0, ...points.map((point) => point.y));
  const scaleX = (x) => left + (maxX > minX ? ((x - minX) / (maxX - minX)) * plotWidth : plotWidth / 2);
  const scaleY = (y) => top + plotHeight - (maxY > 0 ? (y / maxY) * plotHeight : 0);

  chart.append(
    svg("line", { x1: 0, x2: WIDTH, y1: top + plotHeight, y2: top + plotHeight, stroke: "currentColor" }),
  );
  for (const tick of xLabels) {
    chart.append(svg("text", { x: scaleX(tick.x), y: height - 2, "text-anchor": "middle" }, tick.label));
  }

  series.forEach((line, index) => {
    const dash = DASHES[index % DASHES.length];
    const path = line.points
      .map((point, pointIndex) => `${pointIndex ? "L" : "M"}${scaleX(point.x)},${scaleY(point.y)}`)
      .join(" ");
    chart.append(
      svg("path", {
        d: path,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 2,
        "stroke-dasharray": dash || undefined,
      }),
    );
    const last = line.points.at(-1);
    if (last) {
      chart.append(
        tooltip(
          svg("circle", { cx: scaleX(last.x), cy: scaleY(last.y), r: 3 }),
          `${line.name}: ${format(last.y)}`,
        ),
      );
    }

    if (legend) {
      const x = index * 150;
      chart.append(
        svg("line", {
          x1: x,
          x2: x + 24,
          y1: FONT_SIZE / 2 + 2,
          y2: FONT_SIZE / 2 + 2,
          stroke: "currentColor",
          "stroke-width": 2,
          "stroke-dasharray": dash || undefined,
        }),
        svg("text", { x: x + 30, y: FONT_SIZE }, line.name),
      );
    }
  });

  return chart;
}

// Pie chart with a legend beside it. `slices` is [{ label, value }]; group
// with groupSmallest() first, because slices are told apart by opacity and
// more than about six become indistinguishable.
export function pieChart(slices, { label = "Pie chart", size = 180, format = identity } = {}) {
  const chart = frame(size, label);
  const radius = size / 2;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const center = radius;
  let angle = -Math.PI / 2;

  slices.forEach((slice, index) => {
    const opacity = OPACITIES[index % OPACITIES.length];
    const share = total > 0 ? slice.value / total : 0;
    const percent = `${Math.round(share * 100)}%`;
    const text = `${slice.label}: ${format(slice.value)} (${percent})`;

    let shape;
    if (share >= 0.9999) {
      shape = svg("circle", { cx: center, cy: center, r: radius });
    } else {
      const end = angle + share * 2 * Math.PI;
      const large = share > 0.5 ? 1 : 0;
      const start = [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
      const finish = [center + radius * Math.cos(end), center + radius * Math.sin(end)];
      shape = svg("path", {
        d: `M${center},${center} L${start} A${radius},${radius} 0 ${large} 1 ${finish} Z`,
      });
      angle = end;
    }
    shape.setAttribute("fill-opacity", String(opacity));
    // A Canvas-colored edge separates slices of similar opacity.
    shape.setAttribute("stroke", "Canvas");
    chart.append(tooltip(shape, text));

    const rowY = 16 + index * 22;
    chart.append(
      svg("rect", { x: size + 24, y: rowY - 11, width: 14, height: 14, "fill-opacity": opacity }),
      svg("text", { x: size + 46, y: rowY }, slice.label),
      svg("text", { x: WIDTH, y: rowY, "text-anchor": "end" }, `${format(slice.value)} · ${percent}`),
    );
  });

  return chart;
}
