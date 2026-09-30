# Documentation

This directory contains the generated API reference for the StellarAgent SDK.

It is generated from TSD/`TSDoc` comments using [TypeDoc](https://typedoc.org/) and must not be edited by hand. To regenerate the reference, run:

```bash
pnpm docs:api
```

CI will fail if the generated output differs from what is committed.

## Packages

- [@stellaragent/core](core/README.md)
- [@stellaragent/react](react/README.md)
