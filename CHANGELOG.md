# Changelog

Notable changes per release. Every package in this workspace is versioned and
released together.

## 0.0.6

A diagnostic names the line it came from, and the producer gate holds a
frontmatter tag to the fourth canonical spelling.

### API

A `Diagnostic` carries `line`: 1-based, counted from the first line of the file
with the frontmatter included, and absent where there is none. `stray-h1`,
`malformed-card-skipped` and `preamble-tag` carry one. The frontmatter pair and
the two that fire at a conversion boundary do not, because there is no line to
give. `atLine` is the mirror of `atCard` and is exported beside it, so a caller
that raises a diagnostic of its own can point at a line the same way.

Version 1.1 of the format is what names that field rather than leaving four
implementations to spell it four ways, and the corpus is read from that version
now. The fixtures themselves did not change: `line` is a MAY and no
`expected.json` has a place to put one.

### Fixes

`checkCanonical` and `parseCanonical` report a frontmatter tag written with a
leading `#`. §6.4 calls the stripped form canonical and `renderMarkdown` already
wrote it, so the gate accepted files the serializer would have rewritten. The
spec names four canonical spellings, not the three that three comments in this
package claimed: §5.3, §5.4, §6.3 and §6.4.

The suite now asserts the gate over the whole valid tier rather than only the
serializer, which is what would have caught that. It is not "every valid case is
reported": §3.2 scopes the tier 2 producer obligation to spellings, and four of
the nine valid cases are not alternative spellings of anything. An unknown
frontmatter key must be preserved (§4.1), an empty body and a duplicate front
are a producer's own policy (§5.5), and a tag inside a sentence stays where the
author wrote it (§6.3). All four are named in the suite and asserted to be
accepted, because refusing one would be refusing a deck the format calls
conformant.

## 0.0.5

Fixes in both conversion paths, and four new exports from `@ankimd/core`, three
of which were private copies of the same idiom in two or three places.

### Fixes

`ankimd extract` wrote every media file the package named, and a name is
whatever the package says it is: one reading `../../.bashrc` left the media
directory. A name that does not stay inside it is refused and reported now, and
the reference stays in the card as an unresolved one already does.

Images are relocated by reference rather than by text. §7 leaves the link
destination unrestricted, so `](name)` is one spelling of several: the writer
missed `](name "title")` and `](<name>)`, both of which the extractor can emit,
and it rewrote a literal `](name)` sitting in prose or inside a fence. The
reader had the same gap in the other direction, so an image written in angle
brackets was never packaged at all. `relocateImages` is the writer, exported for
a caller that unpacks media somewhere other than beside the Markdown.

A frontmatter tag is held to §6.2's grammar where it is read rather than only on
the way to a package. One that needs a rewrite is reported (`tag-sanitized`),
one the rewrite leaves nothing of is left out and reported, and a `tags` entry
that is a sequence or a mapping of its own stops disappearing in silence.

An inline `data:` image no longer reports `unresolved-image` about a file that
was never missing. A source directory whose name holds glob metacharacters is a
folder and not a pattern. A symlink to a directory is followed rather than
refused as a non-Markdown file. The relative media path written into the
Markdown uses `/` on every platform, which the suite now asserts by running on
Windows rather than by reading. A download timeout is told from a failure by the
controller's own signal rather than by the error's name, which Node's fetch has
at points wrapped in a `TypeError`. A fence's info string is looked up with
`Object.hasOwn`, so a language named `constructor` finds no function on
`Object.prototype`.

### API

A `Deck`'s `title` and `titleSource` are one discriminated union rather than two
independent fields, so `{ title: null, titleSource: "heading" }`, a deck
claiming a `# ` line with no text for it, has no spelling. **`deckOf({ cards,
title })`** derives the pairing and is how a deck assembled by hand is built.

`@ankimd/core` also exports `reasonOf` and `isRemote`, both of which the CLI was
carrying its own copy of.

## 0.0.4

`@ankimd/core` exports its line scan: `scanLines`, `splitSourceLines`, `isBlank`
and the `ScannedLine` type. The format leaves some rules to the producer rather
than requiring them, and a producer checking those over its own output needs to
know which lines are inside a fence. Without this each one carries a second copy
of the fence tracking, which is the duplication this package exists to end.

## 0.0.3

A third package: **`ankimd`**, the unscoped name, so that `npx ankimd` reaches
this command rather than an empty name on the registry. It holds no code. It
depends on `@ankimd/cli` and runs its binary, which `@ankimd/cli` now also
exposes as the `./bin` subpath. Name `@ankimd/cli` in a dependency list; this
one exists for `npx`.

## 0.0.2

No change to either package. `0.0.1` was pushed by hand because the names were
unclaimed and npm asks for a second factor to create one; this release goes out
through the publish workflow on trusted publishing, which is the path every
release after it takes.

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
