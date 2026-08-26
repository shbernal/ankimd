# @ankimd/core

Read and write [Flashcard Markdown](https://github.com/shbernal/flashcard-md-spec),
a plain Markdown format for flashcards that stays readable in Obsidian and in a
diff.

## What it does

```ts
import { parseMarkdown, parseCanonical, renderMarkdown } from "@ankimd/core";

const { deck, diagnostics } = parseMarkdown(source);
const back = deck.cards[0].back;
const source2 = renderMarkdown(deck);
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

## Status

Pre-release, and not published yet. Anki package conversion is not written.

## Install

```sh
pnpm add @ankimd/core
```

## Conformance

The spec ships a conformance corpus, and this package runs all of it in both
directions on every commit: every case parses to the expected model, every
canonical case renders back byte for byte, and every invalid case is rejected by
the producer while still loading for the consumer.

## License

MIT. See [LICENSE](LICENSE).
