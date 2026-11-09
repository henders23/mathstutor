// Groups handwritten strokes into lines of working ("rows").
// Rows let Claude refer to "row 3" and let the board place ticks and notes
// next to the right line, without asking the model for pixel coordinates.

export function strokeBounds(stroke) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of stroke.points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  const pad = (stroke.width ?? 0) / 2;
  return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}

const height = (box) => Math.max(box.bottom - box.top, 1);
const centre = (box) => (box.top + box.bottom) / 2;
const overlap = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

function absorb(row, box, id) {
  row.top = Math.min(row.top, box.top);
  row.bottom = Math.max(row.bottom, box.bottom);
  row.left = Math.min(row.left, box.left);
  row.right = Math.max(row.right, box.right);
  row.strokeIds.push(id);
}

function belongs(row, box) {
  const rowHeight = height(row);
  const boxHeight = height(box);
  if (overlap(row, box) >= 0.4 * Math.min(rowHeight, boxHeight)) return true;
  // Small marks ("-", "=", dots, "²") sit inside or just beside a row's band.
  const slack = 0.2 * rowHeight;
  const c = centre(box);
  return boxHeight < 0.6 * rowHeight && c >= row.top - slack && c <= row.bottom + slack;
}

// strokes: [{ id, points: [{x, y}], width, tool }]
// Returns rows sorted top to bottom: [{ index (1-based), top, bottom, left, right, strokeIds }]
export function segmentRows(strokes) {
  const boxes = strokes
    .filter((stroke) => stroke.tool !== "highlighter" && stroke.points.length > 0)
    .map((stroke) => ({ id: stroke.id, box: strokeBounds(stroke) }))
    // Tall strokes first so they establish each row's band before small marks attach.
    .sort((a, b) => height(b.box) - height(a.box));

  const rows = [];
  for (const { id, box } of boxes) {
    let best = null;
    let bestScore = -Infinity;
    for (const row of rows) {
      if (!belongs(row, box)) continue;
      const score = overlap(row, box) - Math.abs(centre(row) - centre(box)) * 0.1;
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    if (best) absorb(best, box, id);
    else rows.push({ ...box, strokeIds: [id] });
  }

  // Merge rows that grew into each other.
  rows.sort((a, b) => a.top - b.top);
  const merged = [];
  for (const row of rows) {
    const previous = merged[merged.length - 1];
    if (previous && overlap(previous, row) >= 0.5 * Math.min(height(previous), height(row))) {
      for (const id of row.strokeIds) absorb(previous, row, id);
    } else {
      merged.push({ ...row, strokeIds: [...row.strokeIds] });
    }
  }

  return merged.map((row, i) => ({ ...row, index: i + 1 }));
}
