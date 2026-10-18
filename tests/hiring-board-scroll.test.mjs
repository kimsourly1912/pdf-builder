import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../features/hiring/board-auto-scroll.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const { edgeScrollSpeed, startBoardAutoScroll } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

test("edge scrolling eases toward either edge without moving the center or distant pointers", () => {
  assert.equal(edgeScrollSpeed(400, 200, 800), 0);
  assert(edgeScrollSpeed(220, 200, 800) < 0);
  assert(edgeScrollSpeed(780, 200, 800) > 0);
  assert(
    Math.abs(edgeScrollSpeed(790, 200, 800)) >
      Math.abs(edgeScrollSpeed(740, 200, 800)),
  );
  assert.equal(edgeScrollSpeed(40, 200, 800), 0);
  assert.equal(edgeScrollSpeed(100, 200, 200), 0);
  assert.equal(edgeScrollSpeed(105, 100, 110), 0);
});

function mockGlobal(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  });
}

function fixture(t) {
  let next = 0;
  const frames = new Map();
  const vertical = [];
  const board = {
    scrollLeft: 0,
    getBoundingClientRect: () => ({
      left: 200,
      right: 900,
      top: 100,
      bottom: 1200,
    }),
    contains: (target) => target.inside,
  };
  mockGlobal(t, "requestAnimationFrame", (callback) => {
    const id = ++next;
    frames.set(id, callback);
    return id;
  });
  mockGlobal(t, "cancelAnimationFrame", (id) => frames.delete(id));
  return {
    board,
    frames,
    vertical,
    step(time) {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(time);
    },
  };
}

// The browser APIs are injected only for these isolated controller tests.
test("a stationary pointer keeps revealing new columns, re-hit-tests targets, and stops cleanly", (t) => {
  mockGlobal(t, "window", { innerWidth: 900, innerHeight: 800, scrollBy() {} });
  let hit = { inside: true, dataset: { hiringStage: "next" } };
  mockGlobal(t, "document", {
    elementFromPoint: () => ({ closest: () => hit }),
  });
  const f = fixture(t);
  const targets = [];
  const scroller = startBoardAutoScroll(
    f.board,
    () => ({ x: 890, y: 400 }),
    (stage) => targets.push(stage),
  );
  f.step(0);
  const first = f.board.scrollLeft;
  hit = { inside: true, dataset: { hiringStage: "further" } };
  f.step(16);
  assert(f.board.scrollLeft > first && first > 0);
  assert.deepEqual(targets, ["next", "further"]);
  scroller.stop();
  assert.equal(f.frames.size, 0);
});

test("outside or missing drag pointers cannot scroll the board or activate unrelated targets", (t) => {
  const vertical = [];
  mockGlobal(t, "window", {
    innerWidth: 900,
    innerHeight: 800,
    scrollBy: (...args) => vertical.push(args),
  });
  mockGlobal(t, "document", {
    elementFromPoint: () => ({
      closest: () => ({ inside: false, dataset: { hiringStage: "foreign" } }),
    }),
  });
  const f = fixture(t);
  const targets = [];
  let point = { x: 100, y: 790 };
  const scroller = startBoardAutoScroll(
    f.board,
    () => point,
    (stage) => targets.push(stage),
  );
  f.step(0);
  point = null;
  f.step(16);
  assert.equal(f.board.scrollLeft, 0);
  assert.deepEqual(vertical, []);
  assert.deepEqual(targets, [null, null]);
  scroller.stop();
});

test("a fast edge drag responds before the next animation frame without double-counting time", (t) => {
  mockGlobal(t, "window", { innerWidth: 900, innerHeight: 800, scrollBy() {} });
  mockGlobal(t, "document", { elementFromPoint: () => null });
  const f = fixture(t);
  let point = { x: 500, y: 400 };
  const scroller = startBoardAutoScroll(
    f.board,
    () => point,
    () => {},
  );
  scroller.update(10);
  point = { x: 890, y: 400 };
  scroller.update(26);
  const immediate = f.board.scrollLeft;
  assert(immediate > 0);
  f.step(24); // A RAF timestamp may precede an event handler's performance.now().
  assert.equal(f.board.scrollLeft, immediate);
  f.step(42);
  assert.equal(f.board.scrollLeft, immediate * 2);
  scroller.stop();
});

test("the visible viewport edge scrolls long boards vertically and caps resumed-frame jumps", (t) => {
  const vertical = [];
  mockGlobal(t, "window", {
    innerWidth: 900,
    innerHeight: 800,
    scrollBy: (_x, y) => vertical.push(y),
  });
  mockGlobal(t, "document", { elementFromPoint: () => null });
  const f = fixture(t);
  const scroller = startBoardAutoScroll(
    f.board,
    () => ({ x: 890, y: 790 }),
    () => {},
  );
  f.step(0);
  f.step(10000);
  assert.equal(vertical.length, 2);
  assert(vertical.every((distance) => distance > 0 && distance <= 25.6));
  scroller.stop();
});
