import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildTestApp, errorOf, makeEquipment, type TestApp } from "./testkit.ts";

const PDF = new Uint8Array([...new TextEncoder().encode("%PDF-1.4\n"), 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 9]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const UNKNOWN = new TextEncoder().encode("just some bytes, no magic");

function fileForm(bytes: Uint8Array, name: string): FormData {
  const fd = new FormData();
  fd.append("file", new Blob([bytes.buffer as ArrayBuffer]), name);
  return fd;
}

describe("uploads & attachments (§6.8)", () => {
  let t: TestApp;
  let eqId: string;

  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
    const eq = await makeEquipment(t, { name: "Records Van", meterKind: "none" });
    eqId = eq.id;
  });
  afterAll(() => t.close());

  test("documents: MIME sniffed, stored ext derived, listed, downloadable", async () => {
    const up = await t.call(`/api/equipment/${eqId}/documents`, {
      method: "POST",
      auth: true,
      body: fileForm(PDF, "title\u201d.pdf"),
    });
    expect(up.status).toBe(201);
    const doc = await up.json();
    expect(doc.mimeType).toBe("application/pdf");
    expect(doc.filename).toBe("title.pdf"); // quote stripped for display/CD
    expect(doc.storedName).toMatch(/^[0-9a-f-]+\.pdf$/); // ext from sniffed MIME, never the name

    // client lies: PNG bytes named .html → still image/png, stored .png
    const sneaky = await (
      await t.call(`/api/equipment/${eqId}/documents`, {
        method: "POST",
        auth: true,
        body: fileForm(PNG, "payload.html"),
      })
    ).json();
    expect(sneaky.mimeType).toBe("image/png");
    expect(sneaky.storedName).toMatch(/\.png$/);

    // unknown bytes stay honest
    const unknown = await (
      await t.call(`/api/equipment/${eqId}/documents`, {
        method: "POST",
        auth: true,
        body: fileForm(UNKNOWN, "mystery.dat"),
      })
    ).json();
    expect(unknown.mimeType).toBe("application/octet-stream");

    const list = await (await t.call(`/api/attachments/equipment/${eqId}`, { auth: true })).json();
    expect(list.map((a: { id: string }) => a.id)).toContain(doc.id);

    // documents always download
    const dl = await t.call(`/api/attachments/${doc.id}`, { auth: true });
    expect(dl.headers.get("content-disposition")).toMatch(
      /^attachment; filename\*=UTF-8''title\.pdf$/,
    );
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await dl.arrayBuffer()).subarray(0, 5)).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    );
  });

  test("photos: images only — a PDF photo gets 415", async () => {
    const label = await t.call(`/api/equipment/${eqId}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ label: "Wash", date: "2026-06-10" }),
    });
    const work = await label.json();

    const bad = await t.call(`/api/interventions/${work.id}/photos`, {
      method: "POST",
      auth: true,
      body: fileForm(PDF, "invoice.pdf"),
    });
    expect(bad.status).toBe(415);
    expect((await errorOf(bad)).code).toBe("unsupported_media");

    const good = await t.call(`/api/interventions/${work.id}/photos`, {
      method: "POST",
      auth: true,
      body: fileForm(JPEG, "after.jpg"),
    });
    expect(good.status).toBe(201);
    const photo = await good.json();
    expect(photo.mimeType).toBe("image/jpeg");

    // real images may render inline
    const view = await t.call(`/api/attachments/${photo.id}`, { auth: true });
    expect(view.headers.get("content-disposition")).toMatch(/^inline/);

    // deleting the work sweeps photo rows (bytes are covered by the delete route)
    await t.call(`/api/interventions/${work.id}`, { method: "DELETE", auth: true });
    const list = await (await t.call(`/api/attachments/equipment/${eqId}`, { auth: true })).json();
    expect(list.map((a: { id: string }) => a.id)).not.toContain(photo.id);
  });

  test("deleting an attachment removes metadata and bytes", async () => {
    const doc = await (
      await t.call(`/api/equipment/${eqId}/documents`, {
        method: "POST",
        auth: true,
        body: fileForm(PDF, "manual.pdf"),
      })
    ).json();
    expect(
      (await t.call(`/api/attachments/${doc.id}`, { method: "DELETE", auth: true })).status,
    ).toBe(204);
    expect((await t.call(`/api/attachments/${doc.id}`, { auth: true })).status).toBe(404);
  });

  test("empty file and missing field are validation errors", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([]), "empty.pdf");
    const res = await t.call(`/api/equipment/${eqId}/documents`, {
      method: "POST",
      auth: true,
      body: fd,
    });
    expect(res.status).toBe(400);
  });
});

describe("upload size cap (§6.8)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp({ maxUploadBytes: 64 });
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("oversized bodies are rejected 413 before buffering", async () => {
    const eq = await makeEquipment(t, { name: "Big File Bin" });
    const fat = new Uint8Array(2000).fill(0x25); // way over 64 bytes
    const res = await t.call(`/api/equipment/${eq.id}/documents`, {
      method: "POST",
      auth: true,
      body: fileForm(fat, "fat.pdf"),
    });
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe("payload_too_large");
  });
});

describe("intervention cascade rules (§2)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("deleting the meter-setting work rolls the reading back", async () => {
    const eq = await makeEquipment(t, { name: "Cascade Coupe", meterKind: "miles" });
    await t.call(`/api/equipment/${eq.id}/interventions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ label: "First service", date: "2026-01-01", meterAt: 200 }),
    });
    const second = await (
      await t.call(`/api/equipment/${eq.id}/interventions`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ label: "Second service", date: "2026-05-01", meterAt: 500 }),
      })
    ).json();
    expect((await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json()).reading).toBe(
      500,
    );

    await t.call(`/api/interventions/${second.id}`, { method: "DELETE", auth: true });
    const after = await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json();
    expect(after.reading).toBe(200); // back to the highest remaining record
    expect(after.readingUpdatedAt).toBe("2026-01-01");
  });

  test("editing meter-at follows the reading while it is the source", async () => {
    const eq = await makeEquipment(t, { name: "Patched Pickup", meterKind: "hours" });
    const first = await (
      await t.call(`/api/equipment/${eq.id}/interventions`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ label: "Tune-up", date: "2026-02-01", meterAt: 100 }),
      })
    ).json();

    await t.call(`/api/interventions/${first.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ meterAt: 120 }),
    });
    expect((await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json()).reading).toBe(
      120,
    );

    // and back down when corrected (the row is still the reading's source)
    await t.call(`/api/interventions/${first.id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ meterAt: 90 }),
    });
    expect((await (await t.call(`/api/equipment/${eq.id}`, { auth: true })).json()).reading).toBe(
      90,
    );
  });

  test("expiry dates recalculate from remaining work", async () => {
    const eq = await makeEquipment(t, { name: "Plate Carrier" });
    const task = await (
      await t.call(`/api/equipment/${eq.id}/tasks`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          name: "Registration",
          kind: "expiry",
          currentExpiryDate: "2026-01-01",
        }),
      })
    ).json();
    const renewal = await (
      await t.call(`/api/equipment/${eq.id}/interventions`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ taskId: task.id, date: "2026-05-01", expiryDate: "2027-01-01" }),
      })
    ).json();
    expect(
      (await (await t.call(`/api/tasks/${task.id}`, { auth: true })).json()).currentExpiryDate,
    ).toBe("2027-01-01");

    // undo the renewal → the previous recorded expiry stands again
    const prior = await (
      await t.call(`/api/equipment/${eq.id}/interventions`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ taskId: task.id, date: "2026-04-01", expiryDate: "2026-09-01" }),
      })
    ).json();
    void prior;
    await t.call(`/api/interventions/${renewal.id}`, { method: "DELETE", auth: true });
    expect(
      (await (await t.call(`/api/tasks/${task.id}`, { auth: true })).json()).currentExpiryDate,
    ).toBe("2026-09-01");
  });
});
