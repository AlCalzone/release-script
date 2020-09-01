# Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ## __WORK IN PROGRESS__
-->

## __WORK IN PROGRESS__
* Fix: The git branch status is now detected using machine-readable commands instead of the (possibly localized) `git status`
* The release-script now uses itself to create new releases

## v1.7.0 (2020-08-24)
* It is now possible to configure some of the settings with a config file
* Added the `beforePush` hook to run scripts before creating and pushing the release commit

## v1.6.0 (2020-06-21)
* Added support for monorepos that are managed with [lerna](https://github.com/lerna/lerna)

## v1.5.1 (2020-06-06)
* Added support for splitting the changelog into README.md and CHANGELOG_OLD.md
