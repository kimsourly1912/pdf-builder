export type DragPoint = { x: number; y: number };

/** Ease into edge scrolling; return pixels per second, independent of refresh rate. */
export function edgeScrollSpeed(position: number, start: number, end: number) {
  if (end <= start || position < start - 40 || position > end + 40) return 0;
  const edge = Math.min(80, (end - start) / 3);
  if (position < start + edge) {
    return -800 * Math.min(1, (start + edge - position) / edge) ** 2;
  }
  if (position > end - edge) {
    return 800 * Math.min(1, (position - end + edge) / edge) ** 2;
  }
  return 0;
}

/** Keep scrolling and hit-testing even when a native drag pointer stops moving. */
export function startBoardAutoScroll(
  board: HTMLElement,
  getPoint: () => DragPoint | null,
  onStage: (stageId: string | null) => void,
) {
  let frame = 0;
  let previous: number | null = null;
  function update(time: number) {
    const seconds =
      Math.min(Math.max(previous === null ? 16 : time - previous, 0), 32) /
      1000;
    previous = Math.max(previous ?? time, time);
    const point = getPoint();
    if (point) {
      const rect = board.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      if (
        point.x >= left - 40 &&
        point.x <= right + 40 &&
        point.y >= Math.max(0, rect.top) &&
        point.y <= Math.min(window.innerHeight, rect.bottom)
      ) {
        board.scrollLeft += edgeScrollSpeed(point.x, left, right) * seconds;
        const vertical =
          edgeScrollSpeed(point.y, 0, window.innerHeight) * seconds;
        if (vertical) window.scrollBy(0, vertical);
      }
      // Scrolling moves targets underneath a stationary pointer.
      const target = document
        .elementFromPoint(point.x, point.y)
        ?.closest<HTMLElement>("[data-hiring-stage]");
      onStage(
        target && board.contains(target)
          ? (target.dataset.hiringStage ?? null)
          : null,
      );
    } else {
      onStage(null);
    }
  }
  function tick(time: number) {
    update(time);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return { update, stop: () => cancelAnimationFrame(frame) };
}
