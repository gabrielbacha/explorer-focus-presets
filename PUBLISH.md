# Publishing Explorer Focus Presets

This document is for maintainers releasing `gabrielbacha.explorer-focus-presets` to the Visual Studio Marketplace and Open VSX.

## Prepare a release

1. Start from a clean Git working tree.
2. Update the version in `package.json` and `package-lock.json`. To create a patch version commit and Git tag automatically, run:

   ```bash
   npm version patch
   ```

   Use `minor`, `major`, or an exact version when appropriate.

3. Install dependencies, compile, and package the extension:

   ```bash
   npm install
   npm run compile
   npm run package
   ```

4. Confirm that `explorer-focus-presets-<version>.vsix` was created and that the package listing includes `README.md`, `LICENSE`, `icon.png`, `package.json`, and the compiled `out/` files.

The same VSIX must be published to both registries so the extension contents stay identical.

## Publish to Open VSX

The Open VSX token is stored locally in the gitignored `.env.local` file as `OVSX_PAT`.

```bash
source .env.local
npx ovsx publish explorer-focus-presets-<version>.vsix -p "$OVSX_PAT"
```

Confirm the release on [Open VSX](https://open-vsx.org/extension/gabrielbacha/explorer-focus-presets).

## Publish to the Visual Studio Marketplace

1. Open [Manage Publishers & Extensions](https://marketplace.visualstudio.com/manage/publishers/gabrielbacha).
2. Under the `gabrielbacha` publisher, choose **New extension → Visual Studio Code**.
3. Upload `explorer-focus-presets-<version>.vsix`.
4. Complete the CAPTCHA if prompted and wait for Microsoft verification.
5. Confirm that the version is public on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=gabrielbacha.explorer-focus-presets).

## Finish the release

Push the release commit and tag after both registries accept the package:

```bash
git push origin main
git push origin --tags
```
