import type {
  ClientPlugin,
  ClientPluginContext,
  ScannedGame,
  StoreScanner,
} from "@droposs/plugin-sdk";

export interface StoreCandidate {
  externalId: string;
  title: string;
  installPath: string;
  executablePath?: string;
}

/**
 * Storage keys the desktop host (or a host-side collector) is expected to
 * populate. Reading the Windows registry / GOG Galaxy database from disk is a
 * host responsibility: this plugin has no arbitrary filesystem or registry
 * access and never probes the OS.
 *
 * - `registry`: raw `reg query ...\GOG.com\Games /s` output
 * - `gameInfo`: raw `goggame-<id>.info` JSON (optionally with a known install
 *   path as `{ content, installPath }`)
 * - `dbRows`: parsed rows from GOG Galaxy's SQLite database (the host reads
 *   the DB; pure TS cannot)
 * - `library`: optional pre-normalized candidate array (legacy fallback)
 */
export const GOG_STORAGE_KEYS = {
  registry: "registry",
  gameInfo: "gameInfo",
  dbRows: "dbRows",
  library: "library",
} as const;

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function isAbsolutePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
}

function separatorFor(parts: string[]): string {
  return parts.some((part) => part.includes("\\")) ? "\\" : "/";
}

/** Join path segments using the separator style found in the inputs. */
export function joinPath(...parts: string[]): string {
  const filtered = parts.filter((part) => part.length > 0);
  if (filtered.length === 0) return "";
  const separator = separatorFor(filtered);
  return filtered
    .map((part, index) => {
      let segment = part;
      if (index > 0) segment = segment.replace(/^[\\/]+/, "");
      if (index < filtered.length - 1) segment = segment.replace(/[\\/]+$/, "");
      return segment;
    })
    .join(separator);
}

function extractCommandExecutable(command: string): string | undefined {
  const quoted = command.match(/^\s*"([^"]+)"/);
  if (quoted) return quoted[1];
  const token = command.trim().split(/\s+/)[0];
  return token && token.length > 0 ? token : undefined;
}

function resolveExecutable(
  executable: string,
  installPath: string,
): string {
  if (executable.length === 0) return "";
  if (isAbsolutePath(executable) || installPath.length === 0) return executable;
  return joinPath(installPath, executable);
}

function pushCandidate(
  candidates: StoreCandidate[],
  byId: Map<string, StoreCandidate>,
  candidate: StoreCandidate,
): void {
  const existing = byId.get(candidate.externalId);
  if (!existing) {
    byId.set(candidate.externalId, candidate);
    candidates.push(candidate);
    return;
  }
  if (!existing.installPath && candidate.installPath) {
    existing.installPath = candidate.installPath;
  }
  if (!existing.executablePath && candidate.executablePath) {
    existing.executablePath = candidate.executablePath;
  }
  if (existing.title === "Unknown" && candidate.title !== "Unknown") {
    existing.title = candidate.title;
  }
}

/**
 * Parse `reg query "HKLM\SOFTWARE\WOW6432Node\GOG.com\Games" /s` output into
 * candidates. Values from duplicate registry keys (for example 32-bit and
 * 64-bit hives) are merged, not duplicated.
 */
export function parseGogRegistryQuery(output: string): StoreCandidate[] {
  const candidates: StoreCandidate[] = [];
  const byId = new Map<string, StoreCandidate>();
  let currentId: string | undefined;
  let current: Record<string, string> = {};
  const flush = (): void => {
    if (currentId) {
      const installPath = (current["path"] ?? current["workingDir"] ?? "").trim();
      const exe = (current["exe"] ?? "").trim();
      const commandExe = exe
        ? undefined
        : extractCommandExecutable(current["launchCommand"] ?? "");
      const executable = exe || commandExe || "";
      pushCandidate(candidates, byId, {
        externalId: currentId,
        title: (current["gameName"] ?? current["gameTitle"] ?? "Unknown").trim() || "Unknown",
        installPath,
        executablePath: executable
          ? resolveExecutable(executable, installPath)
          : undefined,
      });
    }
    currentId = undefined;
    current = {};
  };
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^HKEY_/i.test(trimmed) && /GOG\.com\\Games\\/i.test(trimmed)) {
      flush();
      const segment = trimmed.split("\\").pop();
      currentId = segment && segment.length > 0 ? segment : undefined;
      continue;
    }
    if (!currentId) continue;
    const value = line.match(/^\s+(\S+)\s+REG_[A-Z_]+\s*(.*)$/i);
    if (value) {
      current[value[1]] = (value[2] ?? "").trim();
    }
  }
  flush();
  return candidates;
}

/**
 * Parse a `goggame-<id>.info` file. When `installPath` is supplied, a relative
 * `playTasks[].path` is resolved against it; otherwise the raw task path is
 * preserved. Returns `null` for malformed or id-less input.
 */
export function parseGogGameInfo(
  input: unknown,
  installPath?: string,
): StoreCandidate | null {
  let record: unknown = input;
  if (typeof input === "string") {
    try {
      record = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return null;
  }
  const info = record as Record<string, unknown>;
  const externalId = firstString(
    info["gameId"],
    info["rootGameId"],
    info["productId"],
  );
  if (!externalId) return null;
  const title =
    firstString(info["name"], info["gameName"], info["title"]) ?? "Unknown";
  const tasks = Array.isArray(info["playTasks"])
    ? (info["playTasks"] as unknown[]).filter(
        (task): task is Record<string, unknown> =>
          typeof task === "object" && task !== null,
      )
    : [];
  const primary =
    tasks.find(
      (task) => firstString(task["category"]) === "game" && task["isPrimary"] === true,
    ) ??
    tasks.find((task) => firstString(task["category"]) === "game") ??
    tasks.find((task) => firstString(task["path"]) !== undefined);
  const taskPath = primary
    ? firstString(primary["path"], primary["executable"])
    : undefined;
  return {
    externalId,
    title,
    installPath: installPath ?? "",
    executablePath: taskPath
      ? resolveExecutable(taskPath, installPath ?? "")
      : undefined,
  };
}

/**
 * Map parsed GOG Galaxy SQLite rows (as supplied by the host) to candidates.
 * Accepts camelCase and snake_case column names.
 */
export function parseGogDbRows(payload: unknown): StoreCandidate[] {
  const rows = Array.isArray(payload) ? payload : [];
  const candidates: StoreCandidate[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const externalId = String(
      record["productId"] ?? record["product_id"] ?? record["gameId"] ?? record["game_id"] ?? "",
    );
    if (externalId.length === 0) continue;
    const executable = firstString(
      record["executablePath"],
      record["executable_path"],
      record["exe"],
    );
    const installPath = String(
      record["installPath"] ?? record["install_path"] ?? record["path"] ?? "",
    );
    candidates.push({
      externalId,
      title: String(record["title"] ?? record["gameTitle"] ?? record["name"] ?? "Unknown"),
      installPath,
      executablePath:
        executable === undefined
          ? undefined
          : resolveExecutable(executable, installPath),
    });
  }
  return candidates;
}

/**
 * Normalize a pre-scanned candidate array (legacy/fallback source). Only
 * values explicitly present are copied; executable paths are never guessed.
 */
export function parseLibraryEntries(payload: unknown): StoreCandidate[] {
  const entries = (Array.isArray(payload) ? payload : []) as Array<
    Record<string, unknown>
  >;
  return entries
    .map((entry) => ({
      externalId: String(entry.appid ?? entry.id ?? entry.externalId ?? ""),
      title: String(entry.name ?? entry.title ?? "Unknown"),
      installPath: String(entry.installdir ?? entry.installPath ?? ""),
      executablePath: entry.executablePath
        ? String(entry.executablePath)
        : undefined,
    }))
    .filter((entry) => entry.externalId.length > 0);
}

export interface GogGameInfoSource {
  content: string | unknown;
  installPath?: string;
}

export interface GogSnapshot {
  registry?: string | null;
  gameInfo?: Array<string | GogGameInfoSource | null | undefined> | null;
  dbRows?: unknown;
  entries?: unknown;
}

function isGameInfoSource(source: string | GogGameInfoSource): source is GogGameInfoSource {
  return typeof source === "object" && source !== null && "content" in source;
}

/**
 * Combine the raw GOG artifacts into candidates. Registry and `goggame-*.info`
 * data are merged per game id; parsed Galaxy DB rows and pre-scanned entries
 * only act as fallbacks. Returns an empty array when the host supplied
 * nothing (see README "Host requirements").
 */
export function collectGogCandidates(snapshot: GogSnapshot): StoreCandidate[] {
  const candidates: StoreCandidate[] = [];
  const byId = new Map<string, StoreCandidate>();
  if (snapshot.registry) {
    for (const candidate of parseGogRegistryQuery(snapshot.registry)) {
      pushCandidate(candidates, byId, candidate);
    }
  }
  for (const source of snapshot.gameInfo ?? []) {
    if (!source) continue;
    const parsed = isGameInfoSource(source)
      ? parseGogGameInfo(source.content, source.installPath)
      : parseGogGameInfo(source);
    if (parsed) pushCandidate(candidates, byId, parsed);
  }
  if (candidates.length === 0) {
    for (const candidate of parseGogDbRows(snapshot.dbRows)) {
      pushCandidate(candidates, byId, candidate);
    }
  }
  if (candidates.length === 0) {
    candidates.push(...parseLibraryEntries(snapshot.entries));
  }
  return candidates;
}

/**
 * GOG Galaxy library scanner. Detection is injected so it can be unit-tested
 * without touching the filesystem; the desktop host provides real data from
 * the registry and Galaxy's SQLite database. `scan()` returns `[]` when the
 * host has not populated that data.
 */
export class GogScanner implements StoreScanner {
  id = "gog";
  name = "GOG Galaxy";
  store = "gog";

  constructor(
    private readonly detect: () => Promise<StoreCandidate[]>,
  ) {}

  async scan(): Promise<ScannedGame[]> {
    const candidates = await this.detect();
    return candidates.map((candidate) => ({
      externalId: candidate.externalId,
      store: "gog",
      title: candidate.title,
      installPath: candidate.installPath,
      executablePath: candidate.executablePath,
    }));
  }
}

export async function detectFromStorage(
  ctx: ClientPluginContext,
): Promise<StoreCandidate[]> {
  const [registry, gameInfo, dbRows, entries] = await Promise.all([
    ctx.storage.get<string>(GOG_STORAGE_KEYS.registry),
    ctx.storage.get<Array<string | GogGameInfoSource>>(GOG_STORAGE_KEYS.gameInfo),
    ctx.storage.get<unknown>(GOG_STORAGE_KEYS.dbRows),
    ctx.storage.get<unknown>(GOG_STORAGE_KEYS.library),
  ]);
  return collectGogCandidates({ registry, gameInfo, dbRows, entries });
}

export default class GogPlugin implements ClientPlugin {
  metadata = {
    id: "drop-store-gog",
    name: "GOG Galaxy",
    version: "0.1.0",
  };

  async init(ctx: ClientPluginContext): Promise<void> {
    const scanner = new GogScanner(() => detectFromStorage(ctx));
    ctx.registerStoreScanner(scanner);
    ctx.logger.info("GOG Galaxy store scanner registered");
  }
}
