# ankimd

Flashcard Markdown decks to and from Anki packages.

This workspace holds two packages:

- **`@ankimd/core`**, a library that converts between a deck and an `.apkg`
  file. It takes a deck and a path.
- **`@ankimd/cli`**, which ships the `ankimd` binary and everything the library
  deliberately leaves out: reading files off disk, config, templates.

Both implement [Flashcard Markdown](https://github.com/shbernal/flashcard-md-spec),
a plain Markdown format for flashcards that stays readable in Obsidian and in a
diff. `.apkg` reading and writing itself belongs to
[`@shbernal/anki-apkg-export`](https://github.com/shbernal/anki-apkg-export).

## Status

Pre-release. Neither package is published yet, and the conversion is not written.
This section goes away with the first release.

## Install

```sh
pnpm add @ankimd/core
```

For the command line:

```sh
pnpm add -g @ankimd/cli
```

## License

MIT. See [LICENSE](LICENSE).
