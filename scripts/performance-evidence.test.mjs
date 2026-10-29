import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./performance-evidence.mjs";

test("parses BOM, CRLF, multiline fields and escaped trace JSON", () => {
  assert.deepEqual(
    parseCsv(
      '\uFEFFRoute,Traces,Note\r\nGET /api/test,"{""operations"":2}","one\r\ntwo"\r\n',
    ),
    [
      {
        Route: "GET /api/test",
        Traces: '{"operations":2}',
        Note: "one\r\ntwo",
      },
    ],
  );
  assert.throws(() => parseCsv('a,b\n"unfinished'), /Unterminated/);
});
