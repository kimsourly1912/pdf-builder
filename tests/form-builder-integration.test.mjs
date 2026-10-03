import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { PDFDocument, degrees } from "pdf-lib";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const db = sqliteD1(),
  storage = new Map();
let failPdfWrite = false;
const runtime = {
  DB: db,
  FILES: {
    async put(key, bytes) {
      if (failPdfWrite && key.startsWith("submissions/"))
        throw Error("TEST unavailable storage");
      storage.set(key, new Uint8Array(bytes));
    },
    async get(key) {
      const bytes = storage.get(key);
      return bytes ? { body: new Response(bytes).body } : null;
    },
    async delete(key) {
      storage.delete(key);
    },
  },
  MANAGEMENT_EMAIL: "owner@example.com",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "form-integration-test-secret",
  ENVIRONMENT: "development",
  AUTH_BOOTSTRAP_TOKEN: "integration-bootstrap",
};
globalThis.__telegramTestEnv = runtime;
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: {
    alias: {
      "@": root,
      "server-only": root + "/tests/helpers/server-only.mjs",
      "cloudflare:workers": root + "/tests/helpers/cloud-runtime.mjs",
    },
  },
  server: { middlewareMode: true },
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes("NotoSansKhmer"))
    return new Response(
      readFileSync(
        new URL(
          "../node_modules/@expo-google-fonts/noto-sans-khmer/400Regular/NotoSansKhmer_400Regular.ttf",
          import.meta.url,
        ),
      ),
    );
  throw Error("Unexpected external request in form tests");
};
after(async () => {
  globalThis.fetch = originalFetch;
  await vite.close();
  db.close();
  delete globalThis.__telegramTestEnv;
});
const auth = await vite.ssrLoadModule("/lib/auth.ts");
const forms = await vite.ssrLoadModule("/features/forms/form.server.ts");
const model = await vite.ssrLoadModule("/features/forms/form.ts");
const submission = await vite.ssrLoadModule(
  "/features/forms/submission.server.ts",
);
const fill = await vite.ssrLoadModule("/app/api/fill/[token]/route.ts");
const assign = await vite.ssrLoadModule("/app/api/forms/[id]/assign/route.ts");
const accounts = await vite.ssrLoadModule("/app/api/accounts/route.ts");
const legacy = await vite.ssrLoadModule("/app/api/templates/[id]/route.ts");
const download = await vite.ssrLoadModule(
  "/app/api/submissions/[id]/pdf/route.ts",
);
const portal = await vite.ssrLoadModule("/app/api/portal/assignments/route.ts");
const cookieFrom = (r) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
const url = "http://localhost:5173";
function request(path, method = "GET", body, cookie = ownerCookie, extra = {}) {
  const headers = { origin: url, cookie, ...extra };
  if (body !== undefined && !(body instanceof FormData))
    headers["content-type"] = "application/json";
  return new Request(url + path, {
    method,
    headers,
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
}
async function ok(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
async function call(action) {
  return forms.formResponse(action);
}
const field = (id, type, key = id, required = false) => ({
  id,
  type,
  key,
  label: id,
  required,
  width: "full",
  help: "",
  options: [],
  editable: true,
});
let ownerCookie,
  candidateCookie,
  otherCookie,
  accountId,
  id,
  revision,
  definition,
  token,
  publishedId,
  submittedId;
const pdf = await PDFDocument.create();
pdf.addPage([600, 800]);
pdf.addPage([600, 800]).setRotation(degrees(90));
const source = await pdf.save();
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=",
  "base64",
);
const context = (value) => ({ params: Promise.resolve({ id: value }) });
function answers(values, rev = "", photo = false) {
  const body = new FormData();
  body.set("values", JSON.stringify(values));
  body.set("revision", rev);
  if (photo)
    body.set(
      "image:photo",
      new File([image], "photo.png", { type: "image/png" }),
    );
  return body;
}

test("form definitions reject duplicate keys, invalid choices/placements, blank required numbers, forged types and unknown answers", () => {
  const a = field("age", "number", "age", true);
  const def = { format: 1, fields: [a], mappings: [], pageCount: 0 };
  for (const value of ["", " ", null, false, [], {}, "not a number"])
    assert.equal(
      model.answerSchema(def).safeParse({ age: value }).success,
      false,
    );
  assert.equal(model.answerSchema(def).parse({ age: "0" }).age, 0);
  assert.equal(
    model.answerSchema(def).safeParse({ age: 4, extra: "forged" }).success,
    false,
  );
  assert.equal(
    model.definitionSchema.safeParse({
      ...def,
      fields: [a, { ...a, id: "other" }],
    }).success,
    false,
  );
  assert.equal(
    model.definitionSchema.safeParse({
      ...def,
      mappings: [
        {
          id: "map",
          fieldId: "missing",
          page: 1,
          x: 0,
          y: 0,
          width: 0.2,
          height: 0.1,
          fontSize: 12,
          alignment: "left",
        },
      ],
      pageCount: 1,
    }).success,
    false,
  );
  const choices = {
    ...field("choice", "radio"),
    options: [{ id: "yes", label: "Yes" }],
  };
  assert.equal(
    model
      .answerSchema({ ...def, fields: [choices] })
      .safeParse({ choice: "forged" }).success,
    false,
  );
  const email = field("email", "email", "email", true);
  assert.equal(
    model
      .answerSchema({ ...def, fields: [email] }, true)
      .safeParse({ email: "unfinished" }).success,
    true,
  );
  assert.equal(
    model
      .answerSchema({ ...def, fields: [email] })
      .safeParse({ email: "unfinished" }).success,
    false,
  );
});

test("owner-only creation, revision guards and source uploads protect form drafts", async () => {
  const sign = await auth.getAuth().handler(
    new Request(url + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        origin: url,
        "content-type": "application/json",
        "x-pdf-builder-bootstrap": runtime.AUTH_BOOTSTRAP_TOKEN,
      },
      body: JSON.stringify({
        name: "TEST Owner",
        email: runtime.MANAGEMENT_EMAIL,
        password: "TestOwner!9StrongPassword",
      }),
    }),
  );
  await ok(sign);
  ownerCookie = cookieFrom(sign);
  assert.equal(
    (
      await call(() =>
        forms.createForm(
          request("/api/forms", "POST", { name: "Blocked" }, ""),
        ),
      )
    ).status,
    401,
  );
  ({ id, revision } = await ok(
    await call(() =>
      forms.createForm(
        request("/api/forms", "POST", { name: "TEST Employee form" }),
      ),
    ),
    201,
  ));
  definition = {
    format: 1,
    fields: [
      field("name", "short_text", "full_name", true),
      field("email", "email", "contact_email", true),
      { ...field("age", "number", "age", true), min: 18, max: 80 },
      field("photo", "photo"),
      {
        ...field("choice", "radio"),
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
    ],
    mappings: [],
    pageCount: 0,
  };
  const body = {
    name: "TEST Employee form",
    description: "Complete your details",
    definition,
    revision,
  };
  const saved = await ok(
    await call(() =>
      forms.saveForm(request(`/api/forms/${id}`, "PATCH", body), id),
    ),
  );
  revision = saved.revision;
  assert.equal(
    (
      await call(() =>
        forms.saveForm(request(`/api/forms/${id}`, "PATCH", body), id),
      )
    ).status,
    409,
  );
  const upload = new FormData();
  upload.set(
    "pdf",
    new File([source], "employee.pdf", { type: "application/pdf" }),
  );
  upload.set("revision", revision);
  const result = await ok(
    await call(() =>
      forms.uploadFormPdf(request(`/api/forms/${id}/pdf`, "POST", upload), id),
    ),
  );
  revision = result.revision;
  definition = result.definition;
  assert.equal(definition.pageCount, 2);
  assert.equal(storage.size, 1);
  definition.mappings = [
    {
      id: "name_box",
      fieldId: "name",
      page: 1,
      x: 0.2,
      y: 0.2,
      width: 0.6,
      height: 0.08,
      fontSize: 12,
      alignment: "left",
    },
    {
      id: "photo_box",
      fieldId: "photo",
      page: 1,
      x: 0.7,
      y: 0.05,
      width: 0.2,
      height: 0.1,
      fontSize: 12,
      alignment: "left",
    },
    {
      id: "choice_box",
      fieldId: "choice",
      optionValue: "yes",
      page: 2,
      x: 0.2,
      y: 0.2,
      width: 0.1,
      height: 0.1,
      fontSize: 12,
      alignment: "left",
    },
  ];
  ({ revision } = await ok(
    await call(() =>
      forms.saveForm(
        request(`/api/forms/${id}/publish`, "POST", {
          ...body,
          definition,
          revision,
        }),
        id,
        true,
      ),
    ),
  ));
  publishedId = db.sqlite
    .prepare("SELECT current_version_id FROM templates WHERE id=?")
    .get(id).current_version_id;
  assert.equal(
    (await legacy.GET(request(`/api/templates/${id}`), context(id))).status,
    409,
  );
  assert.equal(
    (await legacy.PUT(request(`/api/templates/${id}`, "PUT", {}), context(id)))
      .status,
    409,
  );
});

test("published forms assign all fields to one account and require the assigned identity", async () => {
  const result = await ok(
    await accounts.POST(
      request("/api/accounts", "POST", {
        name: "TEST Candidate",
        email: "candidate@example.com",
        password: "TestCandidate!9Password",
        accountType: "candidate",
      }),
    ),
    201,
  );
  accountId = result.account.id;
  db.sqlite
    .prepare(
      "UPDATE recipient_profiles SET must_change_password=0 WHERE user_id=?",
    )
    .run(accountId);
  const candidate = await auth
    .getAuth()
    .handler(
      request(
        "/api/auth/sign-in/email",
        "POST",
        { email: "candidate@example.com", password: "TestCandidate!9Password" },
        "",
      ),
    );
  await ok(candidate);
  candidateCookie = cookieFrom(candidate);
  const other = await auth.getAuth().api.createUser({
    body: {
      name: "Other",
      email: "other@example.com",
      password: "OtherTest!9Password",
      role: "user",
    },
  });
  db.sqlite
    .prepare(
      "INSERT INTO recipient_profiles(user_id,account_type,must_change_password,created_by_email,created_at,updated_at) VALUES(?, 'candidate',0,?,?,?)",
    )
    .run(
      other.user.id,
      runtime.MANAGEMENT_EMAIL,
      new Date().toISOString(),
      new Date().toISOString(),
    );
  const signin = await auth
    .getAuth()
    .handler(
      request(
        "/api/auth/sign-in/email",
        "POST",
        { email: "other@example.com", password: "OtherTest!9Password" },
        "",
      ),
    );
  await ok(signin);
  otherCookie = cookieFrom(signin);
  const assigned = await ok(
    await assign.POST(
      request(
        `/api/forms/${id}/assign`,
        "POST",
        { email: "candidate@example.com" },
        ownerCookie,
        { "Idempotency-Key": "form-assignment-test-001" },
      ),
      context(id),
    ),
    201,
  );
  token = "assigned_" + assigned.assignment.id;
  assert.equal(
    (
      await fill.GET(
        request(`/api/fill/${token}`, "GET", undefined, otherCookie),
        { params: Promise.resolve({ token }) },
      )
    ).status,
    403,
  );
  const payload = await ok(
    await fill.GET(
      request(`/api/fill/${token}`, "GET", undefined, candidateCookie),
      { params: Promise.resolve({ token }) },
    ),
  );
  assert.equal(payload.formDefinition.fields.length, 5);
  assert.equal(payload.template.versionNumber, 1);
  const list = await ok(
    await portal.GET(
      request("/api/portal/assignments", "GET", undefined, candidateCookie),
    ),
  );
  assert.equal(list.assignments[0].templateKind, "form");
});

let draftRevision;
test("drafts retain private images and unfinished answers, reject forged uploads and stale saves", async () => {
  const partial = {
    name: "សុខ ដារា",
    email: "unfinished",
    age: "",
    photo: "upload",
    choice: "",
  };
  const result = await ok(
    await call(() =>
      submission.saveResponseDraft(
        request(
          `/api/fill/${token}/draft`,
          "PUT",
          answers(partial, "", true),
          candidateCookie,
        ),
        token,
      ),
    ),
  );
  draftRevision = result.revision;
  const payload = await ok(
    await fill.GET(
      request(`/api/fill/${token}`, "GET", undefined, candidateCookie),
      { params: Promise.resolve({ token }) },
    ),
  );
  assert.equal(payload.formDraftValues.email, "unfinished");
  assert.equal(payload.formDraftValues.photo, "stored:photo");
  assert.equal(
    (
      await call(() =>
        submission.draftImage(
          request(
            `/api/fill/${token}/images/photo`,
            "GET",
            undefined,
            otherCookie,
          ),
          token,
          "photo",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(() =>
        submission.draftImage(
          request(
            `/api/fill/${token}/images/photo`,
            "GET",
            undefined,
            candidateCookie,
          ),
          token,
          "photo",
        ),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(() =>
        submission.saveResponseDraft(
          request(
            `/api/fill/${token}/draft`,
            "PUT",
            answers(partial, ""),
            candidateCookie,
          ),
          token,
        ),
      )
    ).status,
    409,
  );
  const bad = new FormData();
  bad.set("values", JSON.stringify(partial));
  bad.set("revision", draftRevision);
  bad.set(
    "image:photo",
    new File(["not an image"], "fake.png", { type: "image/png" }),
  );
  assert.equal(
    (
      await call(() =>
        submission.saveResponseDraft(
          request(`/api/fill/${token}/draft`, "PUT", bad, candidateCookie),
          token,
        ),
      )
    ).status,
    422,
  );
});

test("republishing never changes an existing assignment, its answers or its PDF source", async () => {
  const next = {
    ...definition,
    fields: definition.fields.map((f) =>
      f.id === "name"
        ? { ...f, label: "Revised label", key: "revised_name" }
        : f,
    ),
  };
  ({ revision } = await ok(
    await call(() =>
      forms.saveForm(
        request(`/api/forms/${id}/publish`, "POST", {
          name: "TEST Employee form",
          description: "",
          definition: next,
          revision,
        }),
        id,
        true,
      ),
    ),
  ));
  const payload = await ok(
    await fill.GET(
      request(`/api/fill/${token}`, "GET", undefined, candidateCookie),
      { params: Promise.resolve({ token }) },
    ),
  );
  assert.equal(payload.template.versionNumber, 1);
  assert.equal(payload.formDefinition.fields[0].key, "full_name");
  assert.equal(payload.formDefinition.fields[0].label, "name");
  assert.equal(
    db.sqlite
      .prepare("SELECT template_version_id FROM form_assignments WHERE id=?")
      .get(token.slice(9)).template_version_id,
    publishedId,
  );
});

test("submission validation fails safely; PDF storage failure preserves JSON, completion and idempotency", async () => {
  const params = { params: Promise.resolve({ token }) };
  assert.equal(
    (
      await fill.POST(
        request(
          `/api/fill/${token}`,
          "POST",
          answers(
            {
              name: "Dara",
              email: "invalid",
              age: "",
              photo: "stored:photo",
              choice: "yes",
            },
            draftRevision,
          ),
          candidateCookie,
          { "Idempotency-Key": "response-key-001" },
        ),
        params,
      )
    ).status,
    422,
  );
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM submissions").get().n,
    0,
  );
  failPdfWrite = true;
  const values = {
    name: "សុខ ដារា",
    email: "candidate@example.com",
    age: 24,
    photo: "stored:photo",
    choice: "yes",
  };
  const result = await ok(
    await fill.POST(
      request(
        `/api/fill/${token}`,
        "POST",
        answers(values, draftRevision),
        candidateCookie,
        { "Idempotency-Key": "response-key-001" },
      ),
      params,
    ),
    201,
  );
  submittedId = result.submission.id;
  assert.equal(result.submission.pdfStatus, "failed");
  const saved = db.sqlite
    .prepare("SELECT * FROM submissions WHERE id=?")
    .get(submittedId);
  const json = JSON.parse(saved.values_json);
  assert.equal(json[0].key, "full_name");
  assert.equal(json[0].value, "សុខ ដារា");
  assert.equal(json[3].value.kind, "submission-image");
  assert.equal(saved.template_version_id, publishedId);
  assert.equal(
    db.sqlite
      .prepare("SELECT status FROM form_assignments WHERE id=?")
      .get(token.slice(9)).status,
    "completed",
  );
  const repeat = await ok(
    await fill.POST(
      request(
        `/api/fill/${token}`,
        "POST",
        answers(values, draftRevision),
        candidateCookie,
        { "Idempotency-Key": "response-key-001" },
      ),
      params,
    ),
  );
  assert.equal(repeat.submission.id, submittedId);
  assert.equal(repeat.submission.reused, true);
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM submissions").get().n,
    1,
  );
  failPdfWrite = false;
});

test("PDF retry renders Khmer, images and rotated pages from the pinned snapshot without changing JSON", async () => {
  const before = db.sqlite
    .prepare("SELECT values_json FROM submissions WHERE id=?")
    .get(submittedId).values_json;
  assert.equal(
    await submission.renderSubmissionPdf(
      submittedId,
      runtime.MANAGEMENT_EMAIL,
      url,
    ),
    "ready",
  );
  const response = await download.GET(
    request(`/api/submissions/${submittedId}/pdf`),
    context(submittedId),
  );
  assert.equal(response.status, 200);
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getPage(1).getRotation().angle, 90);
  assert.equal(
    db.sqlite
      .prepare("SELECT values_json FROM submissions WHERE id=?")
      .get(submittedId).values_json,
    before,
  );
  assert.equal(
    await submission.renderSubmissionPdf(
      submittedId,
      runtime.MANAGEMENT_EMAIL,
      url,
    ),
    "ready",
  );
  const responses = await ok(
    await call(() =>
      forms.formResponses(request(`/api/forms/${id}/responses`), id),
    ),
  );
  assert.equal(responses.items[0].pdfStatus, "ready");
  assert.equal(
    (
      await call(() =>
        forms.formResponses(
          request(
            `/api/forms/${id}/responses`,
            "GET",
            undefined,
            candidateCookie,
          ),
          id,
        ),
      )
    ).status,
    401,
  );
});

test("PDF preview accepts private sample images without writing a response or storage object", async () => {
  const size = storage.size;
  const data = new FormData();
  data.set(
    "payload",
    JSON.stringify({
      definition,
      values: { name: "សុខ ដារា", photo: "upload", choice: "yes" },
    }),
  );
  data.set(
    "image:photo",
    new File([image], "sample.png", { type: "image/png" }),
  );
  const response = await forms.previewPdf(
    request(`/api/forms/${id}/preview`, "POST", data),
    id,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(
    (await PDFDocument.load(await response.arrayBuffer())).getPageCount(),
    2,
  );
  assert.equal(storage.size, size);
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM submissions").get().n,
    1,
  );
});

test("submission guard rejects stale drafts and concurrent revocation before any immutable response is written", async () => {
  const assigned = await ok(
    await assign.POST(
      request(
        `/api/forms/${id}/assign`,
        "POST",
        { email: "candidate@example.com" },
        ownerCookie,
        { "Idempotency-Key": "guard-assignment-002" },
      ),
      context(id),
    ),
    201,
  );
  const nextToken = "assigned_" + assigned.assignment.id;
  const values = {
    name: "Candidate",
    email: "candidate@example.com",
    age: 24,
    photo: "",
    choice: "no",
  };
  const draft = await ok(
    await call(() =>
      submission.saveResponseDraft(
        request(
          `/api/fill/${nextToken}/draft`,
          "PUT",
          answers(values),
          candidateCookie,
        ),
        nextToken,
      ),
    ),
  );
  const count = db.sqlite.prepare("SELECT count(*) n FROM submissions").get().n;
  const stale = await fill.POST(
    request(
      `/api/fill/${nextToken}`,
      "POST",
      answers(values, ""),
      candidateCookie,
      { "Idempotency-Key": "stale-response-002" },
    ),
    { params: Promise.resolve({ token: nextToken }) },
  );
  assert.equal(stale.status, 409);
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM submissions").get().n,
    count,
  );
  const fillContext = await (
    await vite.ssrLoadModule("/features/templates/fill-context.server.ts")
  ).findFillContext(nextToken);
  db.sqlite
    .prepare("UPDATE recipient_links SET status='revoked' WHERE id=?")
    .run(fillContext.link.id);
  const revoked = await call(() =>
    submission.submitForm(
      request(
        `/api/fill/${nextToken}`,
        "POST",
        answers(values, draft.revision),
        candidateCookie,
        { "Idempotency-Key": "revoked-response-002" },
      ),
      fillContext,
    ),
  );
  assert.equal(revoked.status, 409);
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM submissions").get().n,
    count,
  );
});

test("owner media downloads are private, and response JSON uses authorized media URLs and human-readable choices", async () => {
  const responses = await ok(
    await call(() =>
      forms.formResponses(request(`/api/forms/${id}/responses`), id),
    ),
  );
  const answer = responses.items[0].answers.find((a) => a.key === "photo");
  assert.equal(answer.value.storageKey, undefined);
  assert.match(answer.value.url, /\/images\/photo$/);
  assert.equal(
    responses.items[0].answers.find((a) => a.key === "choice").displayValue,
    "Yes",
  );
  assert.equal(
    (
      await call(() =>
        submission.responseImage(
          request(`/api/forms/submissions/${submittedId}/images/photo`),
          submittedId,
          "photo",
        ),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(() =>
        submission.responseImage(
          request(
            `/api/forms/submissions/${submittedId}/images/photo`,
            "GET",
            undefined,
            otherCookie,
          ),
          submittedId,
          "photo",
        ),
      )
    ).status,
    401,
  );
});

test("JSON-only forms complete without a PDF and published title/instructions remain pinned", async () => {
  const created = await ok(
    await call(() =>
      forms.createForm(
        request("/api/forms", "POST", { name: "TEST JSON form" }),
      ),
    ),
    201,
  );
  const definition = {
    format: 1,
    fields: [field("comment", "paragraph", "comment", true)],
    mappings: [],
    pageCount: 0,
  };
  const published = await ok(
    await call(() =>
      forms.saveForm(
        request(`/api/forms/${created.id}/publish`, "POST", {
          name: "TEST JSON form",
          description: "Original instructions",
          definition,
          revision: created.revision,
        }),
        created.id,
        true,
      ),
    ),
  );
  const assignment = await ok(
    await assign.POST(
      request(
        `/api/forms/${created.id}/assign`,
        "POST",
        { email: "candidate@example.com" },
        ownerCookie,
        { "Idempotency-Key": "json-assignment-001" },
      ),
      context(created.id),
    ),
    201,
  );
  await ok(
    await call(() =>
      forms.saveForm(
        request(`/api/forms/${created.id}`, "PATCH", {
          name: "Renamed draft",
          description: "Revised instructions",
          definition,
          revision: published.revision,
        }),
        created.id,
      ),
    ),
  );
  const token = "assigned_" + assignment.assignment.id;
  const payload = await ok(
    await fill.GET(
      request(`/api/fill/${token}`, "GET", undefined, candidateCookie),
      { params: Promise.resolve({ token }) },
    ),
  );
  assert.equal(payload.template.name, "TEST JSON form");
  assert.equal(payload.template.description, "Original instructions");
  const result = await ok(
    await fill.POST(
      request(
        `/api/fill/${token}`,
        "POST",
        answers({ comment: "Saved JSON answer" }),
        candidateCookie,
        { "Idempotency-Key": "json-response-001" },
      ),
      { params: Promise.resolve({ token }) },
    ),
    201,
  );
  assert.equal(result.submission.pdfStatus, "not_configured");
});

test("PDF overflow returns an actionable error instead of clipping a saved answer", async () => {
  const small = {
    ...definition,
    mappings: [
      { ...definition.mappings[0], width: 0.015, height: 0.015, fontSize: 6 },
    ],
  };
  const response = await call(() =>
    forms.previewPdf(
      request(`/api/forms/${id}/preview`, "POST", {
        definition: small,
        values: {
          name: "A very long answer that cannot fit in a tiny PDF box",
        },
      }),
      id,
    ),
  );
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /cannot fit/);
});

test("direct mapping keeps old definitions compatible and validates explicit exclusions and formatting", async () => {
  const old = model.definitionSchema.parse(definition);
  assert.equal(old.mappings[0].textMode, undefined);
  const styled = { ...definition, mappings: [{ ...definition.mappings[0], color: "#123456", background: "#ffffff", textMode: "single", lineSpacing: 1.6, minFontSize: 10 }] };
  const parsed = model.definitionSchema.parse(styled);
  const placement = model.outputPlacements(parsed, { name: "TEST" }).annotations[0];
  assert.equal(placement.color, "#123456");
  assert.equal(placement.background, "#ffffff");
  assert.equal(placement.textMode, "single");
  assert.equal(placement.minFontSize, 10);
  assert.equal(model.definitionSchema.safeParse({ ...styled, mappings: [{ ...styled.mappings[0], background: "url(bad)" }] }).success, false);
  assert.equal(model.definitionSchema.safeParse({ ...styled, mappings: [{ ...styled.mappings[0], minFontSize: 18 }] }).success, false);
  assert.equal(model.definitionSchema.safeParse({ ...styled, fields: styled.fields.map((f) => f.id === "name" ? { ...f, excludeFromPdf: true } : f) }).success, false);
  assert.equal(model.definitionSchema.safeParse({ ...styled, mappings: [], fields: styled.fields.map((f) => f.id === "name" ? { ...f, excludeFromPdf: true } : f) }).success, true);
  const tools = await vite.ssrLoadModule("/features/forms/mapping-tools.ts");
  const atEdge = tools.clampPlacement(styled.mappings[0], { x: 1, y: 1, width: 0.3, height: 0.1 });
  assert.equal(atEdge.x, 0.7); assert.equal(atEdge.y, 0.9);
  const snapped = tools.snapPlacement({ ...atEdge, x: 0.201, y: 0.1 }, [{ ...atEdge, id: "other", x: 0.2, y: 0.4 }], { width: 600, height: 800 });
  assert.equal(snapped.mapping.x, 0.2);
  assert.equal(tools.mappingProgress({ ...styled, fields: styled.fields.map((f) => f.id === "photo" ? { ...f, excludeFromPdf: true } : f) }).excluded, 1);
});

test("single-line PDF output respects minimum size and wrap mode can fit the same long answer", async () => {
  const mapping = { ...definition.mappings[0], width: 0.2, height: 0.3, fontSize: 12, minFontSize: 12, textMode: "single", color: "#123456", background: "#ffffff" };
  const values = { name: "This long answer needs several lines in a narrow area" };
  const response = await call(() => forms.previewPdf(request(`/api/forms/${id}/preview`, "POST", { definition: { ...definition, mappings: [mapping] }, values }), id));
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /cannot fit/);
  const wrapped = await forms.previewPdf(request(`/api/forms/${id}/preview`, "POST", { definition: { ...definition, mappings: [{ ...mapping, textMode: "wrap", lineSpacing: 1.5 }] }, values }), id);
  assert.equal(wrapped.status, 200);
  assert.equal((await PDFDocument.load(await wrapped.arrayBuffer())).getPageCount(), 2);
});

test("locked autofill is checked against the immutable assignment snapshot on both draft and final saves", async () => {
  const created = await ok(
    await call(() =>
      forms.createForm(
        request("/api/forms", "POST", { name: "TEST Locked autofill" }),
      ),
    ),
    201,
  );
  const definition = {
    format: 1,
    fields: [
      {
        ...field("name", "short_text", "full_name", true),
        autofill: "candidate.full_name",
        editable: false,
      },
    ],
    mappings: [],
    pageCount: 0,
  };
  await ok(
    await call(() =>
      forms.saveForm(
        request(`/api/forms/${created.id}/publish`, "POST", {
          name: "TEST Locked autofill",
          description: "",
          definition,
          revision: created.revision,
        }),
        created.id,
        true,
      ),
    ),
  );
  const assigned = await ok(
    await assign.POST(
      request(
        `/api/forms/${created.id}/assign`,
        "POST",
        { email: "candidate@example.com" },
        ownerCookie,
        { "Idempotency-Key": "locked-assignment-001" },
      ),
      context(created.id),
    ),
    201,
  );
  db.sqlite
    .prepare("UPDATE form_assignments SET initial_values_json=? WHERE id=?")
    .run(JSON.stringify({ name: "Approved snapshot" }), assigned.assignment.id);
  const token = "assigned_" + assigned.assignment.id;
  for (const draft of [true, false]) {
    const response = await call(() =>
      draft
        ? submission.saveResponseDraft(
            request(
              `/api/fill/${token}/draft`,
              "PUT",
              answers({ name: "Forged change" }),
              candidateCookie,
            ),
            token,
          )
        : fill.POST(
            request(
              `/api/fill/${token}`,
              "POST",
              answers({ name: "Forged change" }),
              candidateCookie,
              { "Idempotency-Key": "locked-response-001" },
            ),
            { params: Promise.resolve({ token }) },
          ),
    );
    assert.equal(response.status, 422);
  }
  const result = await ok(
    await fill.POST(
      request(
        `/api/fill/${token}`,
        "POST",
        answers({ name: "Approved snapshot" }),
        candidateCookie,
        { "Idempotency-Key": "locked-response-002" },
      ),
      { params: Promise.resolve({ token }) },
    ),
    201,
  );
  assert.equal(result.submission.pdfStatus, "not_configured");
});

test("new forms stay out of legacy template/response lists and remain selectable by preparation workflows",async()=>{
  const list=await vite.ssrLoadModule("/app/api/templates/route.ts");
  const responses=await vite.ssrLoadModule("/app/api/submissions/route.ts");
  assert.equal((await ok(await list.GET(request("/api/templates")))).items.length,0);
  assert.equal((await ok(await responses.GET(request("/api/submissions")))).items.length,0);
  const workflows=await vite.ssrLoadModule("/features/workflows/workflow.server.ts");
  const options=await workflows.templateOptions(runtime.MANAGEMENT_EMAIL);
  const option=options.find(o=>o.id===id);assert.equal(option.kind,"form");assert.equal(option.roles.length,1);assert.equal(option.roles[0].id,model.FORM_ASSIGNMENT_ROLE.id);
});


test("HR corrections preserve immutable answers and version, require owner access, and create a guarded new attempt", async () => {
  const review = await vite.ssrLoadModule('/app/api/submissions/[id]/review/route.ts');
  const inbox = await vite.ssrLoadModule('/features/hr/review-inbox.server.ts');
  const created = await ok(await call(() => forms.createForm(request('/api/forms','POST',{name:'TEST HR corrections'}))),201);
  const definition={format:1,fields:[field('comment','paragraph','comment',true)],mappings:[],pageCount:0};
  await ok(await call(() => forms.saveForm(request(`/api/forms/${created.id}/publish`,'POST',{name:'TEST HR corrections',definition,revision:created.revision}),created.id,true)));
  const assigned = await ok(await assign.POST(request(`/api/forms/${created.id}/assign`,'POST',{email:'candidate@example.com'},ownerCookie,{'Idempotency-Key':'hr-review-assignment-001'}),context(created.id)),201);
  const token='assigned_'+assigned.assignment.id;
  const submitted=await ok(await fill.POST(request(`/api/fill/${token}`,'POST',answers({comment:'Original response'}),candidateCookie,{'Idempotency-Key':'hr-review-original-001'}),{params:Promise.resolve({token})}),201);
  const id=submitted.submission.id;
  const original=db.sqlite.prepare('SELECT * FROM submissions WHERE id=?').get(id);
  assert.equal((await review.GET(request(`/api/submissions/${id}/review`,'GET',undefined,candidateCookie),context(id))).status,401);
  assert.equal((await review.POST(request(`/api/submissions/${id}/review`,'POST',{action:'accept',expectedRevision:''},candidateCookie),context(id))).status,401);
  await ok(await review.GET(request(`/api/submissions/${id}/review`),context(id)));
  assert.ok((await inbox.reviewInbox(runtime.MANAGEMENT_EMAIL,new URLSearchParams({search:'TEST HR corrections'}))).items.some(s=>s.id===id));
  assert.equal((await review.POST(request(`/api/submissions/${id}/review`,'POST',{action:'request_corrections',expectedRevision:'',reason:'x'}),context(id))).status,422);
  assert.equal((await review.POST(request(`/api/submissions/${id}/review`,'POST',{action:'accept',expectedRevision:'stale'}),context(id))).status,409);
  const corrected=await ok(await review.POST(request(`/api/submissions/${id}/review`,'POST',{action:'request_corrections',expectedRevision:'',reason:'Please correct the contact details.'}),context(id)));
  assert.equal(corrected.review.reviewStatus,'corrections_requested');
  assert.equal(corrected.assignmentUrl,`/fill/${token}`);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM submissions WHERE id=?').get(id),original);
  const link=db.sqlite.prepare('SELECT * FROM form_assignments WHERE id=?').get(assigned.assignment.id);
  assert.notEqual(link.recipient_link_id,original.recipient_link_id);
  assert.equal(link.template_version_id,original.template_version_id);
  assert.equal(link.status,'assigned');
  const payload=await ok(await fill.GET(request(`/api/fill/${token}`,'GET',undefined,candidateCookie),{params:Promise.resolve({token})}));
  assert.equal(payload.correction.reason,'Please correct the contact details.');
  assert.equal(payload.formDraftValues.comment,'Original response');
  const portalData=await ok(await portal.GET(request('/api/portal/assignments','GET',undefined,candidateCookie)));
  assert.equal(portalData.assignments.find(a=>a.id===assigned.assignment.id).correctionReason,'Please correct the contact details.');
  assert.equal((await review.POST(request(`/api/submissions/${id}/review`,'POST',{action:'accept',expectedRevision:corrected.review.revision}),context(id))).status,409);
  const newBody=answers({comment:'Corrected response'});newBody.set('revision',payload.formDraftRevision);
  const newSubmission=await ok(await fill.POST(request(`/api/fill/${token}`,'POST',newBody,candidateCookie,{'Idempotency-Key':'hr-review-corrected-001'}),{params:Promise.resolve({token})}),201);
  assert.notEqual(newSubmission.submission.id,id);
  const nextId=newSubmission.submission.id;
  const nextDetail=await ok(await review.GET(request(`/api/submissions/${nextId}/review`),context(nextId)));
  assert.equal(nextDetail.review.previous.id,id);
  assert.equal((await ok(await review.GET(request(`/api/submissions/${id}/review`),context(id)))).review.next.id,nextId);
  await ok(await review.POST(request(`/api/submissions/${nextId}/review`,'POST',{action:'accept',expectedRevision:''}),context(nextId)));
  assert.equal(db.sqlite.prepare('SELECT status FROM submission_reviews WHERE submission_id=?').get(nextId).status,'accepted');
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM audit_events WHERE target_id=? AND action=?').get(nextId,'submission.accepted').n,1);
  assert.equal((await review.POST(request(`/api/submissions/${nextId}/review`,'POST',{action:'accept',expectedRevision:''}),context(nextId))).status,409);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM submissions WHERE id=?').get(id),original);
});

test("HR decisions reject archived submissions and concurrent assignment changes without rotating links", async () => {
  const review = await vite.ssrLoadModule('/app/api/submissions/[id]/review/route.ts');
  const original = db.sqlite.prepare('SELECT * FROM submissions WHERE id=?').get(submittedId);
  const assignment = db.sqlite.prepare('SELECT * FROM form_assignments WHERE recipient_link_id=?').get(original.recipient_link_id);
  const originalBatch = db.batch;
  let intercepted=false;
  db.batch = async statements => {
    if(!intercepted && statements[0].query.startsWith('INSERT INTO submission_reviews')) {
      intercepted=true;
      db.sqlite.prepare("UPDATE form_assignments SET updated_at='changed-concurrently' WHERE id=?").run(assignment.id);
    }
    return originalBatch(statements);
  };
  try {
    const response=await review.POST(request(`/api/submissions/${submittedId}/review`,'POST',{action:'request_corrections',expectedRevision:'',reason:'Please update the answer.'}),context(submittedId));
    assert.equal(response.status,409,await response.clone().text());
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM submission_reviews WHERE submission_id=?').get(submittedId).n,0);
    assert.equal(db.sqlite.prepare('SELECT recipient_link_id FROM form_assignments WHERE id=?').get(assignment.id).recipient_link_id,original.recipient_link_id);
  } finally {
    db.batch=originalBatch;
    db.sqlite.prepare('UPDATE form_assignments SET updated_at=? WHERE id=?').run(assignment.updated_at,assignment.id);
  }
  const archive=await vite.ssrLoadModule('/features/archive/archive.server.ts');
  await archive.archiveEntity(runtime.MANAGEMENT_EMAIL,'submission',submittedId);
  assert.equal((await review.POST(request(`/api/submissions/${submittedId}/review`,'POST',{action:'accept',expectedRevision:''}),context(submittedId))).status,404);
  await archive.restoreEntity(runtime.MANAGEMENT_EMAIL,'submission',submittedId,db.sqlite.prepare("SELECT archived_at FROM archive_records WHERE entity_type='submission' AND entity_id=?").get(submittedId).archived_at);
});

test("candidate progress connects manual assignments, HR acceptance and correction history without changing CV approval",async()=>{
 const progress=await vite.ssrLoadModule('/features/candidate-progress/progress.server.ts');
 const home=await vite.ssrLoadModule('/features/hr/home.server.ts');
 const now='2026-10-03T00:00:00.000Z';
 db.sqlite.prepare("INSERT INTO candidates(id,owner_email,user_id,full_name,email,verification_status,created_at,updated_at) VALUES('hr-candidate',?,?,'TEST HR candidate','candidate@example.com','verified',?,?)").run(runtime.MANAGEMENT_EMAIL,accountId,now,now);
 db.sqlite.prepare("INSERT INTO resumes(id,owner_email,candidate_id,file_key,file_name,file_size,content_type,checksum,page_count,source,received_date,status,verification_status,created_at,updated_at) VALUES('hr-cv',?,'hr-candidate','hr-test.pdf','TEST HR CV.pdf',1,'application/pdf','hr-test-checksum',1,'staff','2026-10-03','uploaded','verified',?,?)").run(runtime.MANAGEMENT_EMAIL,now,now);
 db.sqlite.prepare("INSERT INTO candidate_profile_versions(id,owner_email,candidate_id,resume_id,version_number,profile_json,verification_status,source,created_by_email,created_at,verified_at) VALUES('hr-approval',?,'hr-candidate','hr-cv',1,'{}','verified','manual',?,?,?)").run(runtime.MANAGEMENT_EMAIL,runtime.MANAGEMENT_EMAIL,now,now);
 const chosen=db.sqlite.prepare("SELECT f.id FROM form_assignments f JOIN templates t ON t.id=f.template_id WHERE t.name='TEST HR corrections'").get();
 db.sqlite.prepare("UPDATE form_assignments SET candidate_profile_version_id='hr-approval' WHERE id=?").run(chosen.id);
 const item=await progress.detailProgress(runtime.MANAGEMENT_EMAIL,'hr-candidate');
 assert.equal(item.selectedCv.verified,true);
 assert.equal(item.facts.preparationCurrent,true);
 assert.equal(item.facts.required,1);
 assert.equal(item.facts.accepted,1);
 assert.equal(item.stage,'accepted');
 assert.ok(item.forms[0].responseUrl.includes('/submissions/'));
 assert.ok(item.assignments.length>item.forms.length);
 assert.ok(item.activity.some(a=>a.action==='Form corrections requested'));
 assert.ok(item.activity.some(a=>a.action==='Form accepted by HR'));
 const summary=await home.hrHome(runtime.MANAGEMENT_EMAIL);
 assert.equal(summary.tasks.some(t=>t.id==='candidate:hr-candidate'),false);
 assert.ok(summary.counts.review>0);
 const attention=await vite.ssrLoadModule('/features/hr/attention.server.ts');
 const tasks=await attention.attentionTasks(runtime.MANAGEMENT_EMAIL);
 assert(tasks.some(t=>t.type==='submission_review'));assert.equal(summary.total + summary.waitingTotal,tasks.length);
 assert(!tasks.some(t=>t.id===`submission:${submittedId}`&&t.type==='submission_review')||db.sqlite.prepare("SELECT COALESCE(h.status,'pending') status FROM submissions s LEFT JOIN submission_reviews h ON h.submission_id=s.id WHERE s.id=?").get(submittedId).status==='pending');
 assert.equal((await attention.attentionTasks('unrelated@example.com')).length,0);
 assert.equal((await progress.progressOverview('another-owner@example.com')).length,0);
});
test("archived form responses disappear from active lists while protected submission and assignment evidence remains",async()=>{
  const archive=await vite.ssrLoadModule("/features/archive/archive.server.ts");
  await archive.archiveEntity(runtime.MANAGEMENT_EMAIL,"submission",submittedId);
  const responses=await ok(await call(()=>forms.formResponses(request(`/api/forms/${id}/responses`),id)));
  assert.equal(responses.items.some(r=>r.id===submittedId),false);
  assert.match(await archive.deletionBlocker(runtime.MANAGEMENT_EMAIL,"submission",submittedId),/protected evidence/);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM submissions WHERE id=?").get(submittedId).n,1);
  const attention=await vite.ssrLoadModule('/features/hr/attention.server.ts');
  assert(!(await attention.attentionTasks(runtime.MANAGEMENT_EMAIL)).some(t=>t.id===`submission:${submittedId}`));
  await archive.archiveEntity(runtime.MANAGEMENT_EMAIL,"template",id);
  assert.equal((await call(()=>forms.getForm(request(`/api/forms/${id}`),id))).status,404);
  assert.match(await archive.deletionBlocker(runtime.MANAGEMENT_EMAIL,"template",id),/history must be preserved/);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM form_assignments WHERE template_id=?").get(id).n,2);
});

test('workspace setup checks owned published forms and usable preparation without mutations or external effects', async () => {
  const setup = await vite.ssrLoadModule('/features/hr/setup.server.ts');
  const workflowService = await vite.ssrLoadModule('/features/workflows/workflow.server.ts');
  const workflowModel = await vite.ssrLoadModule('/features/workflows/workflow.ts');
  const created = await ok(await call(()=>forms.createForm(request('/api/forms','POST',{name:'TEST setup form'}))),201);
  const before = await setup.workspaceSetup(runtime.MANAGEMENT_EMAIL);
  assert(!before.forms.some(f=>f.id===created.id));
  await ok(await call(()=>forms.saveForm(request(`/api/forms/${created.id}/publish`,'POST',{name:'TEST setup form',description:'',revision:created.revision,definition:{format:1,fields:[field('setup','short_text')],pageCount:0,mappings:[]}}),created.id,true)));
  const w=await workflowService.createWorkflow(runtime.MANAGEMENT_EMAIL);
  const graph=workflowModel.defaultGraph();graph.nodes.find(n=>n.kind==='assign_forms').config.forms=[{templateId:created.id,roleId:model.FORM_ASSIGNMENT_ROLE.id}];
  await workflowService.saveWorkflow(runtime.MANAGEMENT_EMAIL,w.id,{action:'publish',expectedUpdatedAt:w.updatedAt,name:'TEST preparation',graph});
  const runsBefore=db.sqlite.prepare('SELECT count(*) n FROM workflow_runs').get().n;
  const result=await setup.workspaceSetup(runtime.MANAGEMENT_EMAIL);
  assert(result.forms.some(f=>f.id===created.id));assert.equal(result.preparationId,w.id);assert.equal(result.bot.configured,false);
  const foreign=await setup.workspaceSetup('unrelated@example.com');assert.equal(foreign.forms.length,0);assert.equal(foreign.preparationId,null);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM workflow_runs').get().n,runsBefore);
  const archive=await vite.ssrLoadModule('/features/archive/archive.server.ts');await archive.archiveEntity(runtime.MANAGEMENT_EMAIL,'template',created.id);
  const archived=await setup.workspaceSetup(runtime.MANAGEMENT_EMAIL);assert(!archived.forms.some(f=>f.id===created.id));assert.equal(archived.preparationId,null);
});
