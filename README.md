# GOG Galaxy

GOG Galaxy local library scanner client plugin for Drop (#21).

## Build

```sh
npm ci
npm run build
npm test
npm run typecheck
```

## Host requirements

The Drop plugin API exposes no arbitrary filesystem or registry access, so
nothing in this plugin touches the registry or probes the OS. GOG library
discovery is a host responsibility: the desktop host's `game:scan` service must
read the registry, `goggame-<id>.info` files, and/or Galaxy's SQLite database,
then hand the raw data to the plugin through plugin storage.

| Method | Requires host `game:scan`? | Input |
| :--- | :--- | :--- |
| `parseGogRegistryQuery` | No | Raw `reg query "...\GOG.com\Games" /s` output |
| `parseGogGameInfo` | No | `goggame-<id>.info` JSON (optional install path) |
| `parseGogDbRows` | No (host reads SQLite) | Parsed Galaxy DB rows |
| `collectGogCandidates`, `parseLibraryEntries` | No | Host-supplied snapshot / pre-scanned arrays |
| `detectFromStorage` | No (reads `ctx.storage` only) | Host-populated storage keys |
| `GogScanner.scan` | Indirectly | Whatever the host supplied; `[]` otherwise |

Storage keys the host populates:

- `registry`: raw `reg query` output
- `gameInfo`: raw `goggame-<id>.info` JSON, optionally
  `{ content, installPath }`
- `dbRows`: parsed rows from Galaxy's `galaxy-2.0.db` (`sqlite3 -json` output)
- `library`: optional pre-normalized candidate array (legacy fallback)

Registry and `.info` data are merged per game id. Reading `galaxy-2.0.db`
itself is SQLite work that pure TypeScript cannot do without a native
dependency, so that step is explicitly delegated to the host; the plugin only
maps rows.
