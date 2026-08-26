# @ankimd/cli

The `ankimd` command. Converts
[Flashcard Markdown](https://github.com/shbernal/flashcard-md-spec) decks to and
from Anki packages.

Flashcard Markdown is a plain Markdown format for flashcards that stays readable
in Obsidian and in a diff. A deck is a file; a card is a `##` heading and what
follows it.

## Install

```sh
pnpm add -g @ankimd/cli
```

Or run it without installing:

```sh
pnpm dlx @ankimd/cli build notes.md -o deck.apkg
```

## Build a deck

```sh
ankimd build notes.md -o deck.apkg
ankimd build ./vault --deck French -o french.apkg
```

The source is a Markdown file, or a directory whose Markdown files all become
one deck, read in name order. Without `-o` the output takes the source's name.

| Option              | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `-o`, `--output`    | Where to write the `.apkg`                                               |
| `--deck`            | The Anki deck's name. Defaults to the file's `#` title, then to its name |
| `--template`        | A directory holding `front.html`, `back.html` and `style.css`            |
| `--code-theme`      | `dark` or `light`, the Prism theme fenced code is coloured with          |
| `--no-remote-media` | Do not download images the deck references over http                     |
| `--remote-timeout`  | How long to wait for one download, in milliseconds                       |

Fenced code is highlighted while the deck is built, and the theme rides along in
the note type's CSS. Nothing is injected into the deck to run inside Anki.

Images are looked for beside the file that references them, and downloaded when
they are remote. An image that will not resolve is reported and left in the card
exactly as it was written.

## Read a deck back

```sh
ankimd extract deck.apkg -o notes.md
```

The media the deck refers to is written beside the Markdown, where the names it
already carries resolve. `--media-dir` puts it somewhere else and points the
references at it.

| Option           | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `-o`, `--output` | Where to write the Markdown                             |
| `--deck`         | The title to give the deck. Defaults to the file's name |
| `--media-dir`    | Where to write the images                               |
| `--force`        | Overwrite the output file if it is already there        |

**This reads notes and nothing else.** Scheduling, review history and note
identity are not in what comes out, so a deck extracted to Markdown and built
back is a new deck with no reviews on it. `extract` refuses to write an `.apkg`
for that reason. Edit a deck you are studying in Anki.

What survives each direction, and what does not, is in
[the round-trip table](https://github.com/shbernal/ankimd/blob/master/docs/round-trip.md).

## Diagnostics

Both commands write to stderr whatever a conversion had to give up: a note type
with no Markdown spelling, an image that would not resolve, a tag that had to be
rewritten. The format requires it. A quiet success on a deck that lost half its
notes would be the bug, not the tidy interface.

## Requirements

Node.js >= 24.

## License

MIT. See [LICENSE](LICENSE).
