# AI project guidelines

`ankimd`: the workspace behind `@ankimd/core` and `@ankimd/cli`, which convert
Flashcard Markdown decks to and from Anki packages.

- Layout
  - `packages/core` is `@ankimd/core`. It takes a `Deck` and a path, and nothing
    else. No config loading, no globbing, no syntax highlighting, no network.
  - `cli` is `@ankimd/cli` and ships the `ankimd` binary. Everything the library
    refuses lives here.
  - The dependency graph enforces that split, so a library consumer never pulls
    the CLI's dependencies. Keep it that way.
  - `.apkg` reading and writing is not here. It is `@shbernal/anki-apkg-export`,
    which owns the format in both directions.

- Key commands
  - `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm test`,
    `pnpm run build`. CI runs those five by name.
  - `pnpm run prose` checks the prose files charcheck.config.js names.

- Tooling
  - Node >= 24, ESM throughout, TypeScript 7.x, pnpm plus turbo.
  - oxlint with `--type-aware` and oxfmt. Not ESLint or Prettier: the rest of
    this family is mid-migration, and this repo starts on the far side of it.
  - `.oxlintrc.json` enables all five categories. Every exemption in it carries
    the reason it exists. Read those before adding another.

- Iron Laws
  - Tokens are expensive, state of the art models need minimal guidance, don't repeat yourself, don't babysit, don't be over-specific.
  - AI-native project. All code is AI-generated.
  - Minimal attention when model implements without errors, we document in more detail when model struggles.
  - Do not expect the user to have read each line, don't lose him on the internals, give visibility on a higher-architectural level.
  - No journaling: code comments / documentation describe current state, they don't carry a log of their own edit history.
