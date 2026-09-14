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
 * GOG Galaxy library scanner. Detection is injected so it can be unit-tested
 * without touching the filesystem; the desktop host provides real paths via
 * `ctx.serverRequest`/`ctx.system` in a full build.
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

export function parseLibraryEntries(payload: unknown): StoreCandidate[] {
  const entries = (Array.isArray(payload) ? payload : []) as Array<Record<string, unknown>>;
  return entries.map((entry) => ({
    externalId: String(entry.appid ?? entry.id ?? entry.externalId ?? ""),
    title: String(entry.name ?? entry.title ?? "Unknown"),
    installPath: String(entry.installdir ?? entry.installPath ?? ""),
    executablePath: entry.executablePath ? String(entry.executablePath) : undefined,
  }));
}

export default class GogPlugin implements ClientPlugin {
  metadata = {
    id: "drop-store-gog",
    name: "GOG Galaxy",
    version: "0.1.0",
  };

  async init(ctx: ClientPluginContext): Promise<void> {
    const scanner = new GogScanner(async () =>
      parseLibraryEntries(await ctx.storage.get<unknown>("library")),
    );
    ctx.registerStoreScanner(scanner);
    ctx.logger.info("GOG Galaxy store scanner registered");
  }
}
