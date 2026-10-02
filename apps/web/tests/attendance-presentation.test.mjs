import assert from "node:assert/strict";
import { test } from "node:test";
import {
  distanceFromHall,
  getDevicePresentation,
} from "../src/features/attendance/lib/record-presentation.ts";

test("legacy device emoji are removed and the correct device kind is selected", () => {
  assert.deepEqual(getDevicePresentation("📱 Android 10 • Chrome"), {
    label: "Android 10 • Chrome",
    kind: "phone",
  });
  assert.deepEqual(getDevicePresentation("💻 Windows 10/11 • Edge"), {
    label: "Windows 10/11 • Edge",
    kind: "computer",
  });
  assert.equal(getDevicePresentation("iPad • Safari").kind, "tablet");
  assert.deepEqual(getDevicePresentation(), { label: "", kind: "unknown" });
});

test("zero coordinate locations are valid and absent locations have no distance", () => {
  assert.equal(
    distanceFromHall(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ),
    0,
  );
  assert.equal(
    distanceFromHall(undefined, { latitude: 30, longitude: 29 }),
    null,
  );
  assert.equal(
    distanceFromHall(
      { latitude: NaN, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ),
    null,
  );
});

test("distance remains correct for nearby and distant attendees", () => {
  assert.equal(
    distanceFromHall(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    ),
    111195,
  );
});
