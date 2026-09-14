import test from "node:test";
import assert from "node:assert/strict";
import { MockClientPluginContext } from "@droposs/plugin-sdk";
import Plugin, {
  GogScanner,
  collectGogCandidates,
  parseGogDbRows,
  parseGogGameInfo,
  parseGogRegistryQuery,
  parseLibraryEntries,
} from "../src/index.js";
import {
  cyberpunkGameInfo,
  galaxyDbRows,
  registryQueryOutput,
  witcherGameInfo,
} from "./fixtures/gog.js";

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

test("parseGogRegistryQuery parses reg query output", () => {
  const candidates = parseGogRegistryQuery(registryQueryOutput);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates[0], {
    externalId: "1207658691",
    title: "The Witcher 3: Wild Hunt",
    installPath: "C:\\Games\\The Witcher 3",
    executablePath: "C:\\Games\\The Witcher 3\\witcher3.exe",
  });
  assert.equal(
    candidates[1].executablePath,
    "D:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe",
  );
  assert.equal(candidates[2].executablePath, undefined);
});

test("parseGogRegistryQuery tolerates empty and unrelated output", () => {
  assert.deepEqual(parseGogRegistryQuery(""), []);
  assert.deepEqual(parseGogRegistryQuery("HKEY_CURRENT_USER\\Software\\Other\n    x    REG_SZ    y"), []);
});

test("parseGogGameInfo resolves primary play task against install path", () => {
  const candidate = parseGogGameInfo(witcherGameInfo, "C:\\Games\\The Witcher 3");
  assert.deepEqual(candidate, {
    externalId: "1207658691",
    title: "The Witcher 3: Wild Hunt",
    installPath: "C:\\Games\\The Witcher 3",
    executablePath: "C:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe",
  });
});

test("parseGogGameInfo preserves relative task path without install path", () => {
  const candidate = parseGogGameInfo(cyberpunkGameInfo);
  assert.equal(candidate?.executablePath, "bin\\x64\\Cyberpunk2077.exe");
});

test("parseGogGameInfo rejects malformed input", () => {
  assert.equal(parseGogGameInfo("not json"), null);
  assert.equal(parseGogGameInfo(null), null);
  assert.equal(parseGogGameInfo({ name: "no id" }), null);
});

test("parseGogDbRows maps snake_case and camelCase rows", () => {
  const candidates = parseGogDbRows(galaxyDbRows);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].externalId, "1207658692");
  assert.equal(candidates[0].installPath, "D:\\Games\\Cyberpunk 2077");
  assert.equal(candidates[1].executablePath, "C:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe");
});

test("collectGogCandidates merges registry and game info per game", () => {
  const registryWithoutExe = registryQueryOutput.replace(
    "    exe    REG_SZ    witcher3.exe\n",
    "",
  );
  const candidates = collectGogCandidates({
    registry: registryWithoutExe,
    gameInfo: [{ content: witcherGameInfo, installPath: "C:\\Games\\The Witcher 3" }],
  });
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].executablePath, "C:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe");
});

test("collectGogCandidates falls back to Galaxy DB rows and pre-scanned entries", () => {
  const fromDb = collectGogCandidates({ dbRows: galaxyDbRows });
  assert.equal(fromDb.length, 2);
  assert.equal(fromDb[0].externalId, "1207658692");
  const fromEntries = collectGogCandidates({
    entries: [{ appid: 570, name: "Dota 2", installdir: "/games/dota" }],
  });
  assert.equal(fromEntries.length, 1);
  assert.equal(fromEntries[0].externalId, "570");
});

test("collectGogCandidates returns empty when host supplied nothing", () => {
  assert.deepEqual(collectGogCandidates({}), []);
  assert.deepEqual(collectGogCandidates({ registry: "", gameInfo: [null, ""] }), []);
});

test("scan returns empty until the host populates GOG data", async () => {
  const ctx = new MockClientPluginContext("drop-store-gog", ["client:library-scan"]);
  await new Plugin().init(ctx);
  const games = await ctx.storeScanners[0].scan();
  assert.deepEqual(games, []);
});

test("scanner consumes host-provided storage snapshot", async () => {
  const ctx = new MockClientPluginContext("drop-store-gog", ["client:library-scan"]);
  const registryWithoutExe = registryQueryOutput.replace(
    "    exe    REG_SZ    witcher3.exe\n",
    "",
  );
  await ctx.storage.set("registry", registryWithoutExe);
  await ctx.storage.set("gameInfo", [
    { content: witcherGameInfo, installPath: "C:\\Games\\The Witcher 3" },
  ]);
  await new Plugin().init(ctx);
  const games = await ctx.storeScanners[0].scan();
  assert.equal(games.length, 3);
  assert.equal(games[0].externalId, "1207658691");
  assert.equal(games[0].executablePath, "C:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe");
});
