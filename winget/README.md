# winget manifests

Helm's [winget](https://github.com/microsoft/winget-pkgs) package manifests.
This directory is the source of truth; the copies that ship live in Microsoft's
`winget-pkgs` repository and get there by pull request.

Three files, the standard multi-file manifest layout, schema `1.6.0`:

| File | Role |
|---|---|
| `Helm.Helm.yaml` | Version manifest — ties the set together, names the default locale |
| `Helm.Helm.installer.yaml` | Installer URL, hash, architecture, install modes |
| `Helm.Helm.locale.en-US.yaml` | Publisher, description, tags, licence |

Nothing here has been submitted. It is preparation.

---

## Why winget is worth the effort

Helm ships unsigned on Windows, so a browser download carries Mark-of-the-Web
and meets the SmartScreen "Windows protected your PC" interstitial on first
install. **A `winget install` does not.** The client fetches the installer
itself, so no MOTW is attached and no shell prompt appears. For users who reach
for a package manager, winget removes the worst moment in the funnel entirely.

The full strategy is in `WINDOWS.md`, under Code signing.

---

## Blockers — clear these before opening a PR

1. **No Windows artifact is in the R2 bucket.** `scripts/upload-release.sh` was
   extended to upload the Windows setups, blockmaps and `latest.yml`, but no
   release has run since. The installer has to be publicly served before winget
   can validate it.
2. **`updates.get-helm.app` is not bound yet.** The manifest points at that
   custom domain, not the rate-limited `pub-*.r2.dev` hostname. Binding it is
   roadmap item 4 in `CLAUDE.md`. A stable domain is also what SmartScreen
   reputation accrues against, so it is worth doing before the first public
   download either way.
3. **The hash must match the served file exactly.** `InstallerSha256` in
   `Helm.Helm.installer.yaml` is from the local 2026-08-22 build. Re-verify it
   against whatever is actually uploaded — a rebuild changes the hash, and
   validation fails on any mismatch.
4. **Check the identifier is free.** `Helm.Helm` is the natural identifier but
   is a plausible collision with other projects named Helm. Search
   `winget search Helm` and the `manifests/h/Helm/` tree before submitting; if
   it is taken, the identifier and the directory path both change.

---

## Submission

1. Fork [`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) and
   branch from `master`.
2. Copy the three YAML files (not this README) to:

   ```
   manifests/h/Helm/Helm/1.0.3/
   ```

   The path is case-sensitive and mirrors `PackageIdentifier` split on the dot,
   under a first-letter directory, with the version as the leaf.
3. Validate locally before pushing:

   ```powershell
   winget validate --manifest .\manifests\h\Helm\Helm\1.0.3\
   winget install --manifest .\manifests\h\Helm\Helm\1.0.3\
   ```

   The second one is a real install — run it on a machine you are willing to
   install Helm on. It is the same check the pipeline runs in a sandbox, and it
   catches installer-behaviour problems that schema validation cannot.
4. Commit, push, open a PR against `microsoft/winget-pkgs`.
5. Automated validation runs on the PR. It downloads `InstallerUrl`, compares
   the SHA256, scans the binary with Defender, installs it in a sandbox, and
   confirms it can be uninstalled. Expect failures to be reported as labels and
   bot comments on the PR rather than as plain CI logs.

The Defender scan is the step to watch for an unsigned binary. If it flags,
submit the exe to Microsoft's software-developer file submission portal —
<https://www.microsoft.com/en-us/wdsi/filesubmission> — get the detection
cleared, then re-run the PR checks.

---

## Every new version needs a new PR

winget manifests are per-version. Shipping 1.0.4 means a new
`manifests/h/Helm/Helm/1.0.4/` directory with the new URL and hash, submitted
the same way. Helm's own electron-updater path keeps existing users current
regardless, so a lagging winget manifest costs new installs, not upgrades.

[`wingetcreate`](https://github.com/microsoft/winget-create) automates the
mechanical part — it pulls the previous manifest, downloads the new installer,
computes the hash and opens the PR:

```powershell
wingetcreate update Helm.Helm --version 1.0.4 --urls https://updates.get-helm.app/Helm-1.0.4-x64-setup.exe --submit
```

Drop `--submit` to write the files locally and review them first. Keep this
directory in step with whatever ends up merged.

---

## Notes on the manifest content

- **`InstallerType: nsis`** — winget knows NSIS's silent switch, so no
  `InstallerSwitches` block is needed. `/S` was verified by hand on
  2026-08-22 (exit 0, per-user, no UAC).
- **`Scope: user`** — electron-builder is configured `oneClick` with
  `perMachine: false`, so Helm installs into `%LOCALAPPDATA%` for the current
  user and never prompts for elevation.
- **`UpgradeBehavior: install`** — the NSIS installer replaces an existing
  install in place; there is no uninstall-first step.
- **x64 only for now.** `pack:win` also produces an arm64 setup and a dual-arch
  `Helm-<version>-setup.exe`. Either can be added as a second entry under
  `Installers:` once it is uploaded and its served hash is confirmed. Neither
  has been exercised on Windows on ARM.
