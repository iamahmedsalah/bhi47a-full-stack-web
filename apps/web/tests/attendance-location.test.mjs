import assert from "node:assert/strict";
import { test } from "node:test";
import { getAttendancePosition, getHallPosition } from "../src/features/attendance/lib/location.ts";

function position(accuracy, timestamp = Date.now()) {
  return { coords: { latitude: 30.95, longitude: 29.9, accuracy }, timestamp };
}

function provider(run) {
  const cleared = [];
  return {
    cleared,
    watchPosition(success, error, options) {
      assert.equal(options.maximumAge, 0);
      assert.equal(options.enableHighAccuracy, true);
      queueMicrotask(() => run(success, error));
      return 7;
    },
    clearWatch(id) { cleared.push(id); },
  };
}

test("waits for a precise fix after the first coarse home reading", async () => {
  const gps = provider((success) => {
    success(position(3500));
    success(position(120));
    success(position(15));
  });
  const result = await getAttendancePosition(gps);
  assert.equal(result.coords.accuracy, 15);
  assert.deepEqual(gps.cleared, [7]);
});

test("ignores stale and invalid fixes", async () => {
  const gps = provider((success) => {
    success(position(1, Date.now() - 60000));
    success({ ...position(1), coords: { latitude: NaN, longitude: 29.9, accuracy: 1 } });
    success(position(20));
  });
  assert.equal((await getAttendancePosition(gps)).coords.accuracy, 20);
});

test("returns the best fix at the deadline and releases the watch", async () => {
  const gps = provider((success) => {
    success(position(300));
    success(position(80));
    success(position(500));
  });
  assert.equal((await getAttendancePosition(gps, 50, 15)).coords.accuracy, 80);
  assert.deepEqual(gps.cleared, [7]);
});

test("temporary location failures can recover", async () => {
  const gps = provider((success, error) => {
    error({ code: 2 });
    success(position(10));
  });
  assert.equal((await getAttendancePosition(gps)).coords.accuracy, 10);
});

test("permission denial returns promptly and releases the watch", async () => {
  const gps = provider((success, error) => error({ code: 1 }));
  assert.equal(await getAttendancePosition(gps), null);
  assert.deepEqual(gps.cleared, [7]);
});

test("no fix returns null at the deadline", async () => {
  const gps = provider(() => {});
  assert.equal(await getAttendancePosition(gps, 50, 15), null);
  assert.deepEqual(gps.cleared, [7]);
});

test("an inaccurate fix cannot become the saved hall location", async () => {
  const gps = provider((success, error) => {
    success(position(3519));
    error({ code: 1 });
  });
  await assert.rejects(getHallPosition(gps, false), /accuracy is ±3519 m/);
});

test("a precise home location can become the session location", async () => {
  const gps = provider((success) => success(position(12)));
  const result = await getHallPosition(gps, true);
  assert.equal(result.coords.latitude, 30.95);
  assert.equal(result.coords.accuracy, 12);
});

test("cleans up when a provider invokes its callback synchronously", async () => {
  const cleared = [];
  const gps = {
    watchPosition(success) { success(position(10)); return 9; },
    clearWatch(id) { cleared.push(id); },
  };
  assert.equal((await getAttendancePosition(gps)).coords.accuracy, 10);
  assert.deepEqual(cleared, [9]);
});

test("a provider exception returns null without leaving a pending timer", async () => {
  const gps = {
    watchPosition() { throw new Error("Unavailable"); },
    clearWatch() { assert.fail("No watch was started"); },
  };
  assert.equal(await getAttendancePosition(gps), null);
});
