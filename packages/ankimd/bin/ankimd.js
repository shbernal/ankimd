#!/usr/bin/env node

/*
 * The unscoped name, which exists so that `npx ankimd` reaches this project
 * rather than an empty name on the registry.
 *
 * It holds no code of its own on purpose. Importing the real binary runs it,
 * shebang and exit code included, so there is nothing here to keep in step with
 * @ankimd/cli beyond the version range in the manifest.
 */

import "@ankimd/cli/bin";
