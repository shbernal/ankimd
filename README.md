# ankimd

Flashcard Markdown decks to and from Anki packages.

This workspace holds two packages:

- **`@ankimd/core`**, a library that reads and writes Flashcard Markdown and
  converts between a deck and an `.apkg` file. It takes a deck and a path.
  Going back is lossy; [docs/round-trip.md](docs/round-trip.md) is the table.
- **`@ankimd/cli`**, which ships the `ankimd` binary and everything the library
  deliberately leaves out: reading files off disk, config, templates.

Both implement [Flashcard Markdown](https://github.com/shbernal/flashcard-md-spec),
a plain Markdown format for flashcards that stays readable in Obsidian and in a
diff. `.apkg` reading and writing itself belongs to
[`@shbernal/anki-apkg-export`](https://github.com/shbernal/anki-apkg-export).

## Install

The command line:

```sh
pnpm add -g @ankimd/cli
ankimd build notes.md -o deck.apkg
ankimd extract deck.apkg -o notes.md
```

The library:

```sh
pnpm add @ankimd/core
```

## What a deck looks like

```markdown
# Botany

## Leaf venation patterns

- Parallel venation is typical of monocots
- Reticulate venation is typical of dicots

#morphology
```

A card is a `##` heading and what follows it. A `***` splits the front from the
back, `#tags` on their own line are metadata, and the body is arbitrary Markdown:
nested lists, code fences and images all survive.

## Going back

`ankimd extract` reads a package into Markdown. That direction is lossy, and
[docs/round-trip.md](docs/round-trip.md) is the table of what survives it. It
reads notes and nothing else: **scheduling and review history are not in what
comes out.** Edit a deck you are studying in Anki.

## License

MIT. See [LICENSE](LICENSE).
