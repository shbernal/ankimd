# Changelog

Notable changes per release. Both packages in this workspace are versioned and
released together.

## 0.0.1

The first release. Two packages: `@ankimd/core`, a library, and `@ankimd/cli`,
which ships the `ankimd` command.

### Flashcard Markdown

`@ankimd/core` implements
[the format](https://github.com/shbernal/flashcard-md-spec) in both of its
conformance classes, on one scanner and one walk of the grammar.

- `parseMarkdown` never throws. Anything it cannot read becomes a diagnostic and
  the rest of the file still loads, which is what a consumer owes a deck with one
  bad card in it.
- `parseCanonical` refuses anything that is not the canonical spelling and names
  the lines. `checkCanonical` is the same check without the throw.
- `renderMarkdown` emits canonical form only. A canonical deck survives a parse
  and a render byte for byte; a merely valid one comes back normalized.

Card bodies are verbatim source slices, so nested lists, code fences, tables and
deeper headings all survive a round trip untouched. The spec's conformance
corpus runs in every direction on every commit.

### Anki packages

`toApkg` and `writeApkg` build the package Anki imports; `readDeck` reads one
back. Both directions are lossy in the places the two formats do not overlap, and
every loss is either reported as a diagnostic or written down in
[docs/round-trip.md](docs/round-trip.md).

Markdown to package and back reaches a fixpoint after one pass: the first may
change the file, the second changes nothing. Nine of the corpus's fourteen
canonical cases come back byte for byte.

**Reading a package does not read scheduling.** A deck extracted to Markdown and
built back is a new deck with no review history at all.

### The command

```sh
ankimd build   notes.md  -o deck.apkg
ankimd extract deck.apkg -o notes.md
```

`build` takes a file or a directory, colours fenced code with Prism while the
deck is built, resolves images beside the file that names them and downloads the
remote ones. `extract` writes Markdown and refuses to write a package.

Everything either command decides is a decision the library refused to make, so
a library consumer pulls neither a language table nor an argument parser.
