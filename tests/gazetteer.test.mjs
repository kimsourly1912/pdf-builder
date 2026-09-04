import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

const gazetteer = await vite.ssrLoadModule(
  "/features/gazetteer/gazetteer.ts",
);

const province = {
  code: "12",
  nameKm: "ភ្នំពេញ",
  nameEn: "Phnom Penh",
  type: "municipality",
  typeKm: "រាជធានី",
  typeEn: "Capital",
  parentCode: null,
};
const district = {
  code: "1201",
  nameKm: "ចំការមន",
  nameEn: "Chamkar Mon",
  type: "district",
  typeKm: "ខណ្ឌ",
  typeEn: "Khan",
  parentCode: "12",
};

test("formats Cambodia addresses in hierarchy order", () => {
  const value = {
    province,
    district,
    commune: null,
    village: null,
  };

  assert.equal(
    gazetteer.formatCambodiaAddress(value, "bilingual"),
    "ចំការមន / Chamkar Mon, ភ្នំពេញ / Phnom Penh",
  );
});

test("checks completion through the configured administrative level", () => {
  const value = {
    province,
    district,
    commune: null,
    village: null,
  };

  assert.equal(gazetteer.isAddressComplete(value, "district"), true);
  assert.equal(gazetteer.isAddressComplete(value, "commune"), false);
});

test("clears descendants when the configured address depth changes", () => {
  const value = {
    province,
    district,
    commune: {
      code: "120102",
      nameKm: "ទន្លេបាសាក់",
      nameEn: "Tonle Basak",
      type: "commune",
      typeKm: "សង្កាត់",
      typeEn: "Sangkat",
      parentCode: "1201",
    },
    village: {
      code: "12010201",
      nameKm: "ភូមិ ១",
      nameEn: "Village 1",
      type: "village",
      typeKm: "ភូមិ",
      typeEn: "Village",
      parentCode: "120102",
    },
  };

  assert.deepEqual(gazetteer.truncateCambodiaAddress(value, "district"), {
    province,
    district,
    commune: null,
    village: null,
  });
});

test("rejects malformed stored locations", () => {
  const value = gazetteer.parseCambodiaAddress({
    province: { code: "12", nameKm: "ភ្នំពេញ" },
  });

  assert.deepEqual(value, {
    province: null,
    district: null,
    commune: null,
    village: null,
  });
});

test("the server proxy validates and normalizes Gazetteer responses", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({
      data: [
        {
          code: "1201",
          name_km: "ចំការមន",
          name_en: "Chamkar Mon",
          type: "district",
          type_km: "ខណ្ឌ",
          type_en: "Khan",
          parentCode: "12",
        },
      ],
    });
  };

  try {
    const route = await vite.ssrLoadModule("/app/api/gazetteer/route.ts");
    const response = await route.GET(
      new Request("http://localhost/api/gazetteer?level=district&parent=12"),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.match(requestedUrl, /\/districts\?/u);
    assert.match(requestedUrl, /province=12/u);
    assert.deepEqual(payload.data[0], district);
    assert.match(response.headers.get("cache-control"), /max-age=14400/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the server proxy rejects an invalid parent code before fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return Response.json({ data: [] });
  };

  try {
    const route = await vite.ssrLoadModule("/app/api/gazetteer/route.ts?t=invalid");
    const response = await route.GET(
      new Request("http://localhost/api/gazetteer?level=commune&parent=12"),
    );

    assert.equal(response.status, 400);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
