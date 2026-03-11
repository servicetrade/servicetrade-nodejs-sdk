# Publishing

Publishing to npm is automated via GitHub Actions. When you push a version tag, the [`npm-publish`](.github/workflows/npm-publish.yml) workflow runs tests, builds, and publishes to the npm registry with provenance.

```bash
# Bump the version (updates package.json and creates a git tag)
npm version patch   # or minor, or major

# Push the commit and tag to trigger the publish workflow
git push && git push --tags
```

The publish workflow requires an `NPM_TOKEN` secret configured in the repository settings.
