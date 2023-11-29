# Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ## **WORK IN PROGRESS**
-->
## 3.7.0 (2023-11-29)
* Added `-lf` option to run the lock file update with the `--force` flag
* Dependency upgrades

## 3.6.0 (2023-07-03)
* `git` plugin: Add the `--tagOnly` flag to only create a tag without pushing the commit to the release branch.

## 3.5.9 (2022-05-02)
* Dependency upgrades

## 3.5.8 (2022-04-27)
* Add missing `semver` dependency to several plugins
* Dependency upgrades

## 3.5.7 (2022-03-10)
* `iobroker` plugin: call correct method when translating news entries fails

## 3.5.6 (2022-03-06)
* Add missing `fs-extra` dependency to several plugins

## 3.5.4 (2022-03-04)
* `package` plugin: when a Yarn monorepo has no changed packages, abort publish and enforce use of the `--publishAll` flag

## 3.5.3 (2022-03-03)
* Upgrade most dependencies

## 3.5.2 (2022-02-04)
* `package` plugin: When synchronizing lockfile, avoid executing `pre/post/install` scripts.

## 3.5.1 (2022-01-25)
* `iobroker` plugin: Forward slashes in author listings are now supported.

## 3.5.0 (2022-01-11)
* Support managing Yarn monorepos without `lerna`
* Fix: `version` plugin tries to propose the current prerelease identifier instead of always `alpha`
* Publish all packages when promoting from prerelease to full release

## 3.4.3 (2022-01-10)
* Replace `colors` dependency with `picocolors`

## 3.4.2 (2021-12-18)
* `package` plugin: Set package manager to `development` for updating the lockfile to prevent npm7+ from deleting `devDependencies`.

## 3.4.1 (2021-10-27)
* `changelog` plugin: Detect and preserve final newlines in the README and changelog
* `exec` plugin: Ensure correct order of before/after stages

## 3.4.0 (2021-09-27)
* `changelog` plugin: Add option to add empty placeholder after a release

## 3.3.2 (2021-09-26)
* `changelog` plugin: parse subsections correctly

## 3.3.1 (2021-09-17)
* Fix: actually execute `manual-review` plugin

## 3.3.0 (2021-09-16)
* `version` plugin: Support glob/regex based replace in additional files

## 3.2.0 (2021-09-16)
* `iobroker` plugin: Add flag to prevent prerelease versions in `io-package.json`

## 3.1.1 (2021-09-16)
* Execute `manual-review` plugin at the start of the commit phase instead of at the end of the edit phase.

## 3.1.0 (2021-09-15)
* New plugin `license` to check for outdated license years
* New plugin `manual-review` to do manual changes before committing
* Fix: `git` plugin never `amends` commits

## 3.0.0 (2021-09-15)
* Split into plugins
* Interactive version chooser
* Simplified `monorepo` configuration with `lerna`
* BREAKING: Removed native `yarn v2+` workspaces support. Use `lerna` for now.
* BREAKING: Some configuration/CLI options changed.

## 2.2.1 (2021-07-26)
* The script now detects a missing git identity and provides help on how to configure it

## 2.2.0 (2021-07-01)
* Added an automated check of the Github Actions workflow file to spot potential errors that could fail a release

## 2.1.0 (2021-06-30)
* Add support to release `yarn v2+` workspaces (when the `workspace-tools` and `version` plugins are installed)

## 2.0.0 (2021-06-19)
* Require Node.js 12+, update dependencies

## 1.10.0 (2021-04-30)
* Support both `**WORK IN PROGRESS**` and `__WORK IN PROGRESS__` as placeholders

## 1.9.0 (2021-04-23)
* Allow defining different remotes than origin by using `r` flag, e.g. `-r upstream/master`
* Replace `npm` commands with `yarn` when `yarn.lock` is present.

## 1.8.3 (2021-01-11)
* Changelog entries like `* (Author 1, Author 2) Whazaaaap!` are now correctly handled when creating the `io-package.json` news entries.

## 1.8.2 (2021-01-05)
* Updated dependencies

## 1.8.1 (2020-09-15)
* Add `--no-verify` to `git commit` command when using lerna. Otherwise, cleaning up becomes a royal PITA.

## 1.8.0 (2020-09-01) · 2020 Doomsday release :)
* The changelog headline may now contain free text after the placeholder

## 1.7.1 (2020-09-01)
* Fix: The git branch status is now detected using machine-readable commands instead of the (possibly localized) `git status`
* The release-script now uses itself to create new releases

## v1.7.0 (2020-08-24)
* It is now possible to configure some of the settings with a config file
* Added the `beforePush` hook to run scripts before creating and pushing the release commit

## v1.6.0 (2020-06-21)
* Added support for monorepos that are managed with [lerna](https://github.com/lerna/lerna)

## v1.5.1 (2020-06-06)
* Added support for splitting the changelog into README.md and CHANGELOG_OLD.md
