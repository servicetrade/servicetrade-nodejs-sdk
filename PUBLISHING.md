# Publishing to npm

This document describes how to publish the `@servicetrade/sdk` package to the public [npm registry](https://registry.npmjs.org/).

## Prerequisites

### npm Account & Org Access

1. Create an account at [npmjs.com](https://www.npmjs.com) if you don't already have one.
2. Ask an existing admin of the `@servicetrade` npm organization to add your account as a member. The org page is at: https://www.npmjs.com/org/servicetrade
3. Confirm your access by visiting the org page while logged in — you should see yourself listed under members.

### npm Access Token

You need an **Automation** or **Publish** token to authenticate with npm from the CLI.

1. Log in to [npmjs.com](https://www.npmjs.com).
2. Go to your account settings: click your avatar → **Access Tokens**.
3. Click **Generate New Token** → **Classic Token**.
4. Select **Publish** (or **Automation** for CI pipelines) and click **Generate Token**.
5. Copy the token — it will not be shown again.

To authenticate your local CLI with the token, run:

```bash
npm login --registry=https://registry.npmjs.org/
```

Or set the token directly in your user-level `~/.npmrc`:

```
//registry.npmjs.org/:_authToken=YOUR_TOKEN_HERE
```

---

## Important: Check Your `.npmrc` for Registry Overrides

> **Warning:** Some ServiceTrade projects use a `.npmrc` file that redirects the default registry to the **GitHub Packages** registry (e.g. `https://npm.pkg.github.com`). If such a setting is present — either in a project-level `.npmrc` or in your global `~/.npmrc` — the publish command will target GitHub Packages instead of npm, and will fail or publish to the wrong place.

Before publishing, verify that no active `.npmrc` is overriding the registry for the `@servicetrade` scope or the default registry:

```bash
# Check project-level .npmrc (if one exists)
cat .npmrc

# Check your global .npmrc
cat ~/.npmrc

# Confirm the resolved registry that npm will actually use
npm config get registry
```

The output of the last command should be:

```
https://registry.npmjs.org/
```

If it is not, either remove the conflicting registry line before publishing, or pass the registry explicitly on the command line:

```bash
npm publish --registry=https://registry.npmjs.org/ --access public
```

---

## Build & Publish

The `prepublish` script runs the test suite automatically before publishing. The full flow is:

```bash
# 1. Install dependencies
npm install

# 2. Build the TypeScript source
npm run build

# 3. Publish (tests run automatically via prepublish hook)
npm publish --access public
```

Or use the convenience script defined in `package.json`:

```bash
npm run publish
```

### Bumping the Version

Update the version in `package.json` before publishing. Follow [semver](https://semver.org/):

- **Patch** (`2.0.x`) — backwards-compatible bug fixes
- **Minor** (`2.x.0`) — new backwards-compatible functionality
- **Major** (`x.0.0`) — breaking changes

```bash
# Examples
npm version patch   # 2.0.1 → 2.0.2
npm version minor   # 2.0.1 → 2.1.0
npm version major   # 2.0.1 → 3.0.0
```

This command updates `package.json` and creates a git tag automatically. Commit and push both the version bump and the tag:

```bash
git push && git push --tags
```

---

## Verifying the Release

After publishing, confirm the new version is live:

```bash
npm view @servicetrade/sdk versions
```

Or visit the package page directly: https://www.npmjs.com/package/@servicetrade/sdk
