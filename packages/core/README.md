# @ankimd/core

Read and write [Flashcard Markdown](https://github.com/shbernal/flashcard-md-spec),
a plain Markdown format for flashcards that stays readable in Obsidian and in a
diff.

## What it does

```ts
import { localMedia, parseMarkdown, readDeck, renderMarkdown, writeApkg } from "@ankimd/core";

const { deck, diagnostics } = parseMarkdown(source);
const canonical = renderMarkdown(deck);

const found = await writeApkg(deck, "botany.apkg", {
  resolveMedia: localMedia("./notes"),
});

const { markdown, media } = await readDeck(await readFile("botany.apkg"));
```

The format defines two conformance classes, and this package implements both.

- **`parseMarkdown`** is the consumer. It never throws. Anything it cannot read
  becomes a diagnostic and the rest of the file still loads, which is what the
  format obliges a consumer to do rather than refusing a whole deck over one bad
  card.
- **`parseCanonical`** is the producer. It refuses anything that is not the
  canonical spelling and throws with the offending source lines attached. Use it
  on output you just generated, where a failure means "generate it again".
  `checkCanonical` is the same check without the throw.
- **`renderMarkdown`** emits canonical form only. A canonical deck survives a
  parse and a render byte for byte; a merely valid one comes back normalized.

Card bodies are verbatim source slices, so nested lists, code fences, tables and
deeper headings all survive a round trip untouched.

A deck assembled by hand rather than parsed is built with **`deckOf({ cards,
title })`**, which fills in the fields such a deck has nowhere to get and keeps
`titleSource` in step with `title`.

The format leaves some rules to the producer rather than requiring them, such as
whether a bullet-less answer is acceptable. Those belong to the caller, and
**`scanLines`** is what they are checked over: a line scan that knows which lines
are inside a fence, so a rule about bullets does not fire on a code sample.

## Anki packages

**`toApkg`** returns the package bytes and **`writeApkg`** writes them to a path.
Both take a deck and options, never a file to read or a configuration to find.

The heading and everything before the `***` become the note's front, what follows
it becomes the back, and tags map to Anki's `::` nesting. Nothing is dropped in
silence: a card Anki would refuse, two cards that render identically, a tag that
had to be rewritten and an image that would not resolve each come back as a
diagnostic while the rest of the deck converts.

Four things the caller decides, because this package cannot:

| option         | what it is for                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `deckName`     | the Anki deck's name, when the file carries no title                                                  |
| `resolveMedia` | how an image reference becomes bytes; `localMedia(dir)` reads a directory and refuses anything remote |
| `highlight`    | colours fenced code, so no syntax highlighter is a dependency here                                    |
| `template`     | the note type's question, answer and CSS                                                              |

Pass `now` to pin every timestamp in the package, which makes the bytes
reproducible across processes.

## Anki packages, back to Markdown

**`readDeck`** takes the bytes of a package and returns a deck, the canonical
Markdown for it, and the media that deck refers to. **`extractDeck`** is the same
mapping over a package someone else already read.

This direction is lossy and every loss is either documented or reported. It maps
two-field, non-cloze notes and counts everything else by note type; it turns a
field's HTML back into Markdown, keeping nested lists as indentation and demoting
a heading that would otherwise open a card. What survives and what does not is
the table in [docs/round-trip.md](../../docs/round-trip.md).

The one promise it makes is a fixpoint: Markdown to package to Markdown may
change the file, and doing it again changes nothing.

A caller that unpacks the media somewhere other than beside the Markdown points
the deck at it with **`relocateImages(markdown, moves)`**, where `moves` maps the
name a card carries to the path it should carry instead. It rewrites references
rather than text: a `](name)` in prose is left alone, one inside a fence is code,
and a destination in angle brackets or carrying a title is still that
destination.

**It does not read scheduling.** A deck extracted to Markdown and written back is
a new deck, with no review history at all. Edit a deck you are studying in Anki.

## Install

```sh
pnpm add @ankimd/core
```

## Conformance

The spec ships a conformance corpus, and this package runs all of it in both
directions on every commit: every case parses to the expected model, every
canonical case renders back byte for byte, every invalid case is rejected by the
producer while still loading for the consumer, and every canonical case converts
to a package with nothing to report.

`test/fixtures/deck.apkg` is a committed package this suite rebuilds and compares
byte for byte. That the bytes are the ones we meant to write is what the suite
proves; that Anki will take them is checked separately, against the real Anki
library, through the oracle
[`@shbernal/anki-apkg-export`](https://github.com/shbernal/anki-apkg-export)
carries in `tools/oracle/`.

Run `pnpm run fixture:regen` to adopt an intended change to the emitted bytes,
and read the diff before you do.

## License

MIT. See [LICENSE](LICENSE).
