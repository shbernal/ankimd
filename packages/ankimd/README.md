# ankimd

An alias for [`@ankimd/cli`](https://www.npmjs.com/package/@ankimd/cli), which
is where the command and its documentation live.

```sh
npx ankimd build   notes.md  -o deck.apkg
npx ankimd extract deck.apkg -o notes.md
```

This package holds no code. It depends on `@ankimd/cli` and runs its binary, so
that the unscoped name reaches the same program the scope does. Install either
one; `@ankimd/cli` is the one to name in a dependency list.
