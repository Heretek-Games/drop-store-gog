# AGENTS.md — drop-store-gog

GOG Galaxy local library scanner client plugin for Drop (#21).

## Toolchain

- Node >= 22, npm 10+
- `npm ci`, `npm run build`, `npm test`, `npm run typecheck`

## Contract

Built on [`@droposs/plugin-sdk`](https://www.npmjs.com/package/@droposs/plugin-sdk)
(plugin API v2, `^0.4.0` from the npm registry).

## Boundaries

- Pure parsing only: registry output / `.info` JSON / DB rows in,
  `StoreCandidate[]` out.
- Reading `galaxy-2.0.db` requires SQLite, which pure TS does not provide; the
  host supplies parsed rows.
- The plugin never touches the filesystem or registry, never probes the OS,
  and returns `[]` when the host has not supplied a snapshot.
- Host-side file access (`game:scan`) is documented in `README.md`.
