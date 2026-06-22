// Generates docs/diagrams/booking-payout-flow.excalidraw
// Run: node diagrams/generate-booking-payout-flow.js
const fs = require("fs");
const path = require("path");

let seedCounter = 1;
function nextSeed() { return seedCounter++; }
function rid(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }

function rect(x, y, w, h, label, opts = {}) {
  const rectId = rid("rect");
  const textId = rid("text");
  const fontSize = opts.fontSize || 16;
  const lines = label.split("\n");
  const lineHeight = fontSize * 1.25;
  const textHeight = lines.length * lineHeight;
  const textWidth = Math.max(...lines.map((l) => l.length)) * fontSize * 0.6;

  const rectangle = {
    id: rectId,
    type: "rectangle",
    x, y, width: w, height: h,
    angle: 0,
    strokeColor: opts.stroke || "#1e1e1e",
    backgroundColor: opts.bg || "#a5d8ff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: [{ id: textId, type: "text" }],
    updated: 1,
    link: null,
    locked: false,
  };

  const text = {
    id: textId,
    type: "text",
    x: x + (w - textWidth) / 2,
    y: y + (h - textHeight) / 2,
    width: textWidth,
    height: textHeight,
    angle: 0,
    strokeColor: opts.textColor || "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    text: label,
    rawText: label,
    fontSize,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: rectId,
    originalText: label,
    lineHeight: 1.25,
  };

  return { rectangle, text, id: rectId, x, y, w, h };
}

function arrow(from, to, label, opts = {}) {
  const arrowId = rid("arrow");
  // Auto-pick sensible anchor points based on the relative geometry of the
  // two boxes, instead of always assuming a vertical bottom-to-top flow.
  // NOTE: deliberately unbound (no startBinding/endBinding) — Excalidraw
  // recomputes bound-arrow endpoints from focus/gap on load, which flipped
  // direction for same-row and multi-arrow fan-out cases. Plain points are
  // rendered exactly as given.
  let points, x, y;
  if (opts.points) {
    points = opts.points;
    x = opts.x;
    y = opts.y;
  } else {
    const fromCenterY = from.y + from.h / 2;
    const toCenterY = to.y + to.h / 2;
    const sameRow = Math.abs(fromCenterY - toCenterY) < Math.max(from.h, to.h) / 2;

    let sx, sy, ex, ey;
    if (sameRow) {
      if (to.x >= from.x) {
        sx = from.x + from.w; sy = fromCenterY;
        ex = to.x; ey = toCenterY;
      } else {
        sx = from.x; sy = fromCenterY;
        ex = to.x + to.w; ey = toCenterY;
      }
    } else if (to.y >= from.y + from.h) {
      // `to` is below `from` -> flow downward
      sx = from.x + from.w / 2; sy = from.y + from.h;
      ex = to.x + to.w / 2; ey = to.y;
    } else if (from.y >= to.y + to.h) {
      // `to` is above `from` -> flow upward
      sx = from.x + from.w / 2; sy = from.y;
      ex = to.x + to.w / 2; ey = to.y + to.h;
    } else {
      // fallback: center to center
      sx = from.x + from.w / 2; sy = fromCenterY;
      ex = to.x + to.w / 2; ey = toCenterY;
    }
    x = sx;
    y = sy;
    points = [[0, 0], [ex - sx, ey - sy]];
  }

  const elements = [];
  const arrowEl = {
    id: arrowId,
    type: "arrow",
    x, y,
    width: Math.abs(points[points.length - 1][0]),
    height: Math.abs(points[points.length - 1][1]),
    angle: 0,
    strokeColor: opts.stroke || "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: opts.dashed ? "dashed" : "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 2 },
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
  };
  elements.push(arrowEl);

  if (label) {
    const midX = x + points[points.length - 1][0] / 2;
    const midY = y + points[points.length - 1][1] / 2;
    const fontSize = 13;
    const textWidth = label.length * fontSize * 0.6;
    const textId = rid("text");
    elements.push({
      id: textId,
      type: "text",
      x: midX - textWidth / 2,
      y: midY - fontSize,
      width: textWidth,
      height: fontSize * 1.25,
      angle: 0,
      strokeColor: opts.labelColor || "#495057",
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: nextSeed(),
      version: 1,
      versionNonce: nextSeed(),
      isDeleted: false,
      boundElements: [],
      updated: 1,
      link: null,
      locked: false,
      text: label,
      rawText: label,
      fontSize,
      fontFamily: 1,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: null,
      originalText: label,
      lineHeight: 1.25,
    });
  }

  return elements;
}

const elements = [];
const boxes = {};

// ---- Row 1: Citizen ----
boxes.citizen = rect(700, 40, 220, 70, "Citizen", { bg: "#ffd8a8" });

// ---- Row 2: three booking entry points ----
boxes.assetBooking = rect(60, 200, 260, 110, "Asset Booking\n(direct, no Host)\nGET/POST /assets/bookings", { bg: "#b2f2bb" });
boxes.serviceBooking = rect(380, 200, 260, 110, "Service Booking\n(direct, no Host)\nGET/POST /service-bookings", { bg: "#b2f2bb" });
boxes.eventBooking = rect(700, 200, 340, 160,
  "Event Booking\n(from Host's Template)\n\nassembles:\n• Venue (Mayor)\n• Asset(s) (Foxer)\n• Service(s) (Foxer)\n+ Host Markup %", { bg: "#d0bfff" });

// ---- Row 3: combined citizen total ----
boxes.citizenPayment = rect(380, 460, 460, 100,
  "Citizen pays:\nitemsTotal + hostMarkup + platformFee", { bg: "#ffd8a8" });

// ---- Row 4: Stripe ----
boxes.stripeBalance = rect(380, 640, 460, 80,
  "Stripe PaymentIntent\n→ lands in Platform's Stripe balance", { bg: "#a5d8ff" });

// ---- Row 5: status lifecycle ----
boxes.pending = rect(120, 800, 160, 70, "pending", { bg: "#e9ecef" });
boxes.confirmed = rect(340, 800, 160, 70, "confirmed", { bg: "#e9ecef" });
boxes.active = rect(560, 800, 160, 70, "active", { bg: "#e9ecef" });
boxes.completed = rect(780, 800, 180, 70, "completed", { bg: "#69db7c" });
boxes.disputed = rect(560, 940, 180, 80, "disputed\n(held, no transfer\nuntil resolved)", { bg: "#ff8787" });

// ---- Row 6: payouts ----
boxes.mayor = rect(60, 1100, 220, 100, "Mayor\nTransfer: venue agreedPrice", { bg: "#ffec99" });
boxes.foxer = rect(320, 1100, 220, 100, "Foxer(s)\nTransfer: asset/service\nagreedPrice", { bg: "#ffec99" });
boxes.host = rect(580, 1100, 220, 100, "Host\nTransfer: hostMarkup amount", { bg: "#ffec99" });
boxes.platform = rect(840, 1100, 220, 100, "Platform\nkeeps platformFee\n(no transfer — stays in balance)", { bg: "#eebefa" });

Object.values(boxes).forEach((b) => elements.push(b.rectangle, b.text));

// ---- Arrows ----
elements.push(...arrow(boxes.citizen, boxes.assetBooking, "books"));
elements.push(...arrow(boxes.citizen, boxes.serviceBooking, "books"));
elements.push(...arrow(boxes.citizen, boxes.eventBooking, "books"));

elements.push(...arrow(boxes.assetBooking, boxes.citizenPayment));
elements.push(...arrow(boxes.serviceBooking, boxes.citizenPayment));
elements.push(...arrow(boxes.eventBooking, boxes.citizenPayment));

elements.push(...arrow(boxes.citizenPayment, boxes.stripeBalance));
elements.push(...arrow(boxes.stripeBalance, boxes.pending));

elements.push(...arrow(boxes.pending, boxes.confirmed));
elements.push(...arrow(boxes.confirmed, boxes.active));
elements.push(...arrow(boxes.active, boxes.completed));
elements.push(...arrow(boxes.active, boxes.disputed, "dispute filed"));

elements.push(...arrow(boxes.completed, boxes.mayor, "on completed"));
elements.push(...arrow(boxes.completed, boxes.foxer, "on completed"));
elements.push(...arrow(boxes.completed, boxes.host, "on completed"));
elements.push(...arrow(boxes.completed, boxes.platform, "on completed"));

const scene = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    gridSize: 20,
    viewBackgroundColor: "#ffffff",
  },
  files: {},
};

const outPath = path.join(__dirname, "booking-payout-flow.excalidraw");
fs.writeFileSync(outPath, JSON.stringify(scene, null, 2));
console.log("Wrote", outPath, "with", elements.length, "elements");
