import assert from "node:assert/strict";
import test from "node:test";
import { managementPageReady } from "../scripts/deployment-pages.mjs";

test("deployment requires the actual management page heading, rather than a sidebar or serialized string", () => {
  assert.equal(
    managementPageReady("/forms", '<h1 class="title">Form templates</h1>'),
    true,
  );
  assert.equal(
    managementPageReady("/forms", "<nav>Form templates</nav><h1>Sign in</h1>"),
    false,
  );
  assert.equal(managementPageReady("/forms", "<h1>Form Builder</h1>"), false);
  assert.equal(
    managementPageReady("/workflows", "<h1>Auto<!-- -->mation</h1>"),
    true,
  );
  assert.equal(
    managementPageReady("/setup", "<h1>Setup could not be loaded</h1>"),
    false,
  );
  assert.equal(
    managementPageReady("/setup/preview", "<h1>Preview candidate journey</h1>"),
    true,
  );
  assert.equal(
    managementPageReady(
      "/workflows",
      '<script>const html="<h1>Automation</h1>";</script><h1>Sign in</h1>',
    ),
    false,
  );
  assert.equal(managementPageReady("/unknown", "<h1>Automation</h1>"), false);
  assert.equal(
    managementPageReady("/studio", "<div>Drop your PDF here</div>"),
    true,
  );
});
