"use strict";
/*

    Bumps the package version and releases a new tag
    to set off a CI and npm release run

    CALL THIS WITH:
    npx AlCalzone/release-script#v1.0.0 -- [<releaseType> [<postfix]] [--dry]
    or
    npx AlCalzone/release-script#v1.0.0 -- <version> [--dry]

    PLACEHOLDER for next version in CHANGELOG.md:
    ## __WORK IN PROGRESS__

    PLACEHOLDER for next version in README.md:
    ### __WORK IN PROGRESS__

*/
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-var-requires */
const strings_1 = require("alcalzone-shared/strings");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const yargs_1 = require("yargs");
const colors = require("colors/safe");
const rootDir = process.cwd();
function fail(reason) {
    console.error("");
    console.error(colors.red("ERROR: " + reason));
    console.error("");
    process.exit(1);
}
const packPath = path.join(rootDir, "package.json");
if (!fs.existsSync(packPath)) {
    fail("No package.json found in the current directory!");
}
const pack = require(packPath);
if (!((_a = pack) === null || _a === void 0 ? void 0 : _a.version)) {
    fail("Missing property version from package.json!");
}
// If this is an ioBroker project, also bump the io-package.json
const ioPackPath = path.join(rootDir, "io-package.json");
const hasIoPack = fs.existsSync(ioPackPath);
const ioPack = hasIoPack ? require(ioPackPath) : undefined;
if (hasIoPack && !((_c = (_b = ioPack) === null || _b === void 0 ? void 0 : _b.common) === null || _c === void 0 ? void 0 : _c.version)) {
    fail("Missing property common.version from io-package.json!");
}
// Try to find the changelog
let isChangelogInReadme = false;
let CHANGELOG_PLACEHOLDER_PREFIX = "##";
const changelogPath = path.join(rootDir, "CHANGELOG.md");
const readmePath = path.join(rootDir, "README.md");
/** Can also be the readme! */
let changelog;
let changelogFilename;
if (!fs.existsSync(changelogPath)) {
    // The changelog might be in the readme
    if (!fs.existsSync(readmePath)) {
        fail("No CHANGELOG.md or README.md found in the current directory!");
    }
    isChangelogInReadme = true;
    changelog = fs.readFileSync(readmePath, "utf8");
    changelogFilename = path.basename(readmePath);
    // The changelog is indented one more level in the readme
    CHANGELOG_PLACEHOLDER_PREFIX += "#";
}
else {
    changelog = fs.readFileSync(changelogPath, "utf8");
    changelogFilename = path.basename(changelogPath);
}
const CHANGELOG_PLACEHOLDER = CHANGELOG_PLACEHOLDER_PREFIX + " __WORK IN PROGRESS__";
const CHANGELOG_PLACEHOLDER_REGEX = new RegExp("^" + CHANGELOG_PLACEHOLDER + "$", "gm");
// check if the changelog contains exactly 1 occurence of the changelog placeholder
switch ((changelog.match(CHANGELOG_PLACEHOLDER_REGEX) || []).length) {
    case 0:
        fail(colors.red(`Cannot continue, the changelog placeholder is missing from ${changelogFilename}!\n` +
            "Please add the following line to your changelog:\n" +
            CHANGELOG_PLACEHOLDER));
    case 1:
        break; // all good
    default:
        fail(colors.red(`Cannot continue, there is more than one changelog placeholder in ${changelogFilename}!`));
}
// check if there are untracked changes
const gitStatus = child_process_1.execSync("git status", { cwd: rootDir, encoding: "utf8" });
if (/have diverged/.test(gitStatus)) {
    if (!yargs_1.argv.dry) {
        fail(colors.red("Cannot continue, the local branch has diverged from the git repo!"));
    }
    else {
        console.log(colors.red("This is a dry run. The full run would fail due to a diverged branch\n"));
    }
}
else if (!/working tree clean/.test(gitStatus)) {
    if (!yargs_1.argv.dry)
        fail(colors.red("Cannot continue, the local branch has uncommited changes!"));
    else
        console.log(colors.red("This is a dry run. The full run would fail due to uncommited changes\n"));
}
else if (/Your branch is behind/.test(gitStatus)) {
    if (!yargs_1.argv.dry) {
        fail(colors.red("Cannot continue, the local branch is behind the remote changes!"));
    }
    else {
        console.log(colors.red("This is a dry run. The full run would fail due to the local branch being behind\n"));
    }
}
else if (/Your branch is up\-to\-date/.test(gitStatus) ||
    /Your branch is ahead/.test(gitStatus)) {
    // all good
    console.log(colors.green("git status is good - I can continue..."));
}
const releaseTypes = [
    "major",
    "premajor",
    "minor",
    "preminor",
    "patch",
    "prepatch",
    "prerelease",
];
const releaseType = yargs_1.argv._[0] || "patch";
let newVersion = releaseType;
// Find the highest current version
let oldVersion = pack.version;
if (hasIoPack &&
    semver.valid(ioPack.common.version) &&
    semver.gt(ioPack.common.version, oldVersion)) {
    oldVersion = ioPack.common.version;
}
if (releaseTypes.indexOf(releaseType) > -1) {
    if (releaseType.startsWith("pre") && yargs_1.argv._.length >= 2) {
        // increment to pre-release with an additional prerelease string
        newVersion = semver.inc(oldVersion, releaseType, yargs_1.argv._[1]);
    }
    else {
        newVersion = semver.inc(oldVersion, releaseType);
    }
    console.log(`bumping version ${colors.blue(oldVersion)} to ${colors.gray(releaseType)} version ${colors.green(newVersion)}\n`);
}
else {
    // increment to specific version
    newVersion = semver.clean(newVersion);
    if (newVersion == null) {
        fail(`invalid version string "${newVersion}"`);
    }
    else {
        // valid version string => check if its actually newer
        if (!semver.gt(newVersion, pack.version)) {
            fail(`new version ${newVersion} is NOT > than package.json version ${pack.version}`);
        }
        if (hasIoPack && !semver.gt(newVersion, ioPack.common.version)) {
            fail(`new version ${newVersion} is NOT > than io-package.json version ${ioPack.common.version}`);
        }
    }
    console.log(`bumping version ${oldVersion} to specific version ${newVersion}`);
}
if (yargs_1.argv.dry) {
    console.log(colors.yellow("dry run:") + " not updating package files");
}
else {
    console.log(`updating package.json from ${colors.blue(pack.version)} to ${colors.green(newVersion)}`);
    pack.version = newVersion;
    fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));
    console.log(`updating ${changelogFilename}`);
    const d = new Date();
    changelog = changelog.replace(CHANGELOG_PLACEHOLDER_REGEX, `${CHANGELOG_PLACEHOLDER_PREFIX} ${newVersion} (${d.getFullYear()}-${strings_1.padStart("" + (d.getMonth() + 1), 2, "0")}-${strings_1.padStart("" + d.getDate(), 2, "0")})`);
    fs.writeFileSync(isChangelogInReadme ? readmePath : changelogPath, changelog, "utf8");
    if (hasIoPack) {
        console.log(`updating io-package.json from ${colors.blue(ioPack.common.version)} to ${colors.green(newVersion)}`);
        ioPack.common.version = newVersion;
        fs.writeFileSync(ioPackPath, JSON.stringify(ioPack, null, 4));
    }
}
const gitCommands = [
    `npm install`,
    `git add -A`,
    `git commit -m "chore: release v${newVersion}"`,
    `git tag v${newVersion}`,
    `git push`,
    `git push --tags`,
];
if (yargs_1.argv.dry) {
    console.log(colors.yellow("dry run:") + " I would execute this:");
    for (const command of gitCommands) {
        console.log("  " + command);
    }
}
else {
    for (const command of gitCommands) {
        console.log(`executing "${colors.blue(command)}" ...`);
        child_process_1.execSync(command, { cwd: rootDir });
    }
}
console.log("");
console.log(colors.green("done!"));
console.log("");
process.exit(0);
