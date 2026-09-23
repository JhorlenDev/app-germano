// PDF content-stream order is not necessarily the visible reading order.
export function textInReadingOrder(items, viewport) {
  const positioned = items
    .filter(
      (item) =>
        typeof item.str === "string" && item.str.trim() && item.transform,
    )
    .map((item) => {
      const [x, y] = viewport.convertToViewportPoint(
        item.transform[4],
        item.transform[5],
      );
      return { text: item.str, x, y };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const item of positioned) {
    const last = lines.at(-1);
    if (last && Math.abs(last.y - item.y) <= 2) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" "),
    )
    .join("\n");
}
