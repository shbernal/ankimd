# Contributing

Issues and pull requests are welcome, including fully AI-generated ones.

## Disclosure

If a change was produced with an AI harness, say so in the issue or pull request:
which harness and which model. That is the whole requirement. It is not a mark
against the contribution, it is context for reviewing it.

## Getting set up

```sh
pnpm install
pnpm exec lefthook install
```

The package manager version is pinned in `package.json`. Use it rather than a
different one.

## Gates

Five, and CI runs them by name:

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

`lefthook` runs formatting, linting and the prose check on staged files before a
commit, and the last three gates before a push.

## Conventions

- Node >= 24, ESM, TypeScript 7.x.
- oxlint and oxfmt, not ESLint and Prettier. `.oxlintrc.json` runs all five
  categories, `pedantic` and `style` included. Every exemption in it carries the
  reason it is there. Read those before adding one, and write yours the same way.
- No em dashes in prose. `charcheck.config.js` says where that is enforced.
- Comments describe what the code does now. They are not a log of what it used
  to do.
