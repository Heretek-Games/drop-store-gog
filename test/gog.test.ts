import test from "node:test";
import assert from "node:assert/strict";
import { MockClientPluginContext } from "@droposs/plugin-sdk";
import Plugin, { GogScanner, parseLibraryEntries } from "../src/index.js";

test("drop-store-gog registers a store scanner", async () => {
  const ctx = new MockClientPluginContext("drop-store-gog", ["client:library-scan"]);
  await new Plugin().init(ctx);
  assert.equal(ctx.storeScanners.length, 1);
  assert.equal(ctx.storeScanners[0].store, "gog");
});

test("drop-store-gog parses library entries", () => {
  const entries = parseLibraryEntries([{ appid: 570, name: "Dota 2", installdir: "/games/dota" }]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].externalId, "570");
});

test("drop-store-gog scanner maps candidates", async () => {
  const scanner = new GogScanner(async () => [
    { externalId: "1", title: "Game", installPath: "/games/game" },
  ]);
  const games = await scanner.scan();
  assert.equal(games.length, 1);
  assert.equal(games[0].store, "gog");
});
