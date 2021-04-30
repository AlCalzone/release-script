"use strict";
/*

    Bumps the package version and releases a new tag
    to set off a CI and npm release run

    CALL THIS WITH:
    npx AlCalzone/release-script#v1.0.0 -- [<releaseType> [<postfix]] [--dry]
    or
    npx AlCalzone/release-script#v1.0.0 -- <version> [--dry]

    PLACEHOLDER for next version in CHANGELOG.md:
    ## **WORK IN PROGRESS**

    PLACEHOLDER for next version in README.md:
    ### **WORK IN PROGRESS**

*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-var-requires */
const strings_1 = require("alcalzone-shared/strings");
const typeguards_1 = require("alcalzone-shared/typeguards");
const child_process_1 = require("child_process");
const safe_1 = __importDefault(require("colors/safe"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const yargs_1 = require("yargs");
const tools_1 = require("./tools");
const translate_1 = require("./translate");
const parseArgs_1 = require("./parseArgs");
const gitStatus_1 = require("./gitStatus");
const rootDir = process.cwd();
function fail(reason) {
    console.error("");
    console.error(safe_1.default.red("ERROR: " + reason));
    console.error("");
    process.exit(1);
}
// ensure that package.json exists and has a version (in lerna mode)
const packPath = path.join(rootDir, "package.json");
if (!fs.existsSync(packPath)) {
    fail("No package.json found in the current directory!");
}
const pack = require(packPath);
if (!parseArgs_1.lerna && !(pack === null || pack === void 0 ? void 0 : pack.version)) {
    fail("Missing property version from package.json!");
}
const lernaPath = path.join(rootDir, "lerna.json");
if (parseArgs_1.lerna && !fs.existsSync(lernaPath)) {
    fail("No lerna.json found in the current directory!");
}
let lernaJson;
if (parseArgs_1.lerna) {
    lernaJson = require(lernaPath);
    if (!lernaJson.version) {
        fail("Missing property version from lerna.json!");
    }
}
// If this is an ioBroker project, also bump the io-package.json
const ioPackPath = path.join(rootDir, "io-package.json");
const hasIoPack = fs.existsSync(ioPackPath);
const ioPack = hasIoPack ? require(ioPackPath) : undefined;
if (!parseArgs_1.lerna && hasIoPack && !((_a = ioPack === null || ioPack === void 0 ? void 0 : ioPack.common) === null || _a === void 0 ? void 0 : _a.version)) {
    fail("Missing property common.version from io-package.json!");
}
// Assume the repo is managed with yarn if there is a yarn.lock
const isYarn = fs.existsSync(path.join(rootDir, "yarn.lock"));
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
// CHANGELOG_OLD is only used if the main changelog is in the readme
const changelogOldPath = path.join(rootDir, "CHANGELOG_OLD.md");
const hasChangelogOld = isChangelogInReadme && fs.existsSync(changelogOldPath);
const CHANGELOG_MARKERS = ["**WORK IN PROGRESS**", "__WORK IN PROGRESS__"];
const CHANGELOG_PLACEHOLDER = `${CHANGELOG_PLACEHOLDER_PREFIX} ${CHANGELOG_MARKERS[0]}`;
// The regex for the placeholder includes an optional free text at the end, e.g.
// ### __WORK IN PROGRESS__ "2020 Doomsday release"
const CHANGELOG_PLACEHOLDER_REGEX = new RegExp(`^${CHANGELOG_PLACEHOLDER_PREFIX} (?:${CHANGELOG_MARKERS.map(m => m.replace(/\*/g, "\\*")).join("|")})(.*?)$`, "gm");
// check if the changelog contains exactly 1 occurence of the changelog placeholder
switch ((changelog.match(CHANGELOG_PLACEHOLDER_REGEX) || []).length) {
    case 0:
        fail(safe_1.default.red(`Cannot continue, the changelog placeholder is missing from ${changelogFilename}!\n` +
            "Please add the following line to your changelog:\n" +
            CHANGELOG_PLACEHOLDER));
    case 1:
        break; // all good
    default:
        fail(safe_1.default.red(`Cannot continue, there is more than one changelog placeholder in ${changelogFilename}!`));
}
// Check if there is a changelog for the current version
const currentChangelog = tools_1.extractCurrentChangelog(changelog, CHANGELOG_PLACEHOLDER_PREFIX, CHANGELOG_PLACEHOLDER_REGEX);
if (!currentChangelog) {
    fail(safe_1.default.red("Cannot continue, the changelog for the next version is empty!"));
}
// check if there are untracked changes
const branchStatus = gitStatus_1.gitStatus(rootDir);
if (branchStatus === "diverged") {
    if (!parseArgs_1.isDryRun) {
        fail(safe_1.default.red("Cannot continue, both the remote and the local repo have different changes! Please merge the remote changes first."));
    }
    else {
        console.log(safe_1.default.red("This is a dry run. The full run would fail due to a diverged branch\n"));
    }
}
else if (branchStatus === "behind") {
    if (!parseArgs_1.isDryRun) {
        fail(safe_1.default.red(`Cannot continue, the local branch is behind the remote changes! Please include them first, e.g. with "git pull".`));
    }
    else {
        console.log(safe_1.default.red("This is a dry run. The full run would fail due to the local branch being behind\n"));
    }
}
else if (branchStatus === "ahead" || branchStatus === "up-to-date") {
    // all good
    if (!parseArgs_1.lerna) {
        console.log(safe_1.default.green("git status is good - I can continue..."));
    }
}
else if (branchStatus === "uncommitted" && !parseArgs_1.lerna) {
    if (!parseArgs_1.isDryRun && !parseArgs_1.allChanges) {
        fail(safe_1.default.red(`Cannot continue, the local branch has uncommitted changes! Add them to a separate commit first or add the "--all" option to include them in the release commit.`));
    }
    else {
        if (parseArgs_1.allChanges) {
            console.warn(safe_1.default.yellow(`Your branch has uncommitted changes that will be included in the release commit!
Consider adding them to a separate commit first.
`));
        }
        else {
            console.log(safe_1.default.red(`This is a dry run. The full run would fail due to uncommitted changes.
Add them to a separate commit first or add the "--all" option to include them in the release commit.
`));
        }
    }
}
// All the necessary checks are done, exit
if (parseArgs_1.lernaCheck)
    process.exit(0);
const releaseTypes = [
    "major",
    "premajor",
    "minor",
    "preminor",
    "patch",
    "prepatch",
    "prerelease",
];
const releaseType = (yargs_1.argv._[0] || "patch").toString();
if (!parseArgs_1.lerna && releaseType.startsWith("--")) {
    fail(`Invalid release type ${releaseType}. If you meant to pass hyphenated args, try again without the single "--".`);
}
let newVersion;
if (parseArgs_1.lerna) {
    newVersion = lernaJson.version;
}
else {
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
            newVersion = semver.inc(oldVersion, releaseType, (_b = yargs_1.argv._[1]) === null || _b === void 0 ? void 0 : _b.toString());
        }
        else {
            newVersion = semver.inc(oldVersion, releaseType);
        }
        console.log(`bumping version ${safe_1.default.blue(oldVersion)} to ${safe_1.default.gray(releaseType)} version ${safe_1.default.green(newVersion)}\n`);
    }
    else {
        // increment to specific version
        newVersion = semver.clean(releaseType);
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
}
(() => __awaiter(void 0, void 0, void 0, function* () {
    if (parseArgs_1.isDryRun) {
        console.log(safe_1.default.yellow("dry run:") + " not updating package files");
    }
    else {
        if (!parseArgs_1.lerna) {
            console.log(`updating package.json from ${safe_1.default.blue(pack.version)} to ${safe_1.default.green(newVersion)}`);
            pack.version = newVersion;
            fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));
        }
        const d = new Date();
        // Replace the changelog placeholder and keep the free text
        changelog = changelog.replace(CHANGELOG_PLACEHOLDER_REGEX, `${CHANGELOG_PLACEHOLDER_PREFIX} ${newVersion} (${d.getFullYear()}-${strings_1.padStart("" + (d.getMonth() + 1), 2, "0")}-${strings_1.padStart("" + d.getDate(), 2, "0")})$1`);
        // If there's a CHANGELOG_OLD.md, we need to split the changelog
        if (hasChangelogOld) {
            const { newChangelog, oldChangelog } = tools_1.splitChangelog(changelog, CHANGELOG_PLACEHOLDER_PREFIX, 5);
            console.log(`updating ${changelogFilename}`);
            fs.writeFileSync(isChangelogInReadme ? readmePath : changelogPath, newChangelog, "utf8");
            if (oldChangelog) {
                console.log(`moving old changelog entries to CHANGELOG_OLD.md`);
                let oldChangelogFileContent = fs.readFileSync(changelogOldPath, "utf8");
                oldChangelogFileContent = tools_1.insertIntoChangelog(oldChangelogFileContent, oldChangelog, CHANGELOG_PLACEHOLDER_PREFIX.slice(1));
                fs.writeFileSync(changelogOldPath, oldChangelogFileContent, "utf8");
            }
        }
        else {
            console.log(`updating ${changelogFilename}`);
            fs.writeFileSync(isChangelogInReadme ? readmePath : changelogPath, changelog, "utf8");
        }
        // Prepare the changelog so it can be put into io-package.json news and the commit message
        const newChangelog = tools_1.cleanChangelogForNews(currentChangelog);
        // Prepare the commit message
        fs.writeFileSync(path.join(rootDir, ".commitmessage"), `chore: release v${newVersion}

${newChangelog}`);
        if (hasIoPack) {
            console.log(`updating io-package.json from ${safe_1.default.blue(ioPack.common.version)} to ${safe_1.default.green(newVersion)}`);
            ioPack.common.version = newVersion;
            if (newVersion in ioPack.common.news) {
                console.log(`current news is already in io-package.json`);
            }
            else if (typeguards_1.isObject(ioPack.common.news.NEXT)) {
                console.log(`replacing version number for current news io-package.json...`);
                ioPack.common.news = tools_1.prependKey(ioPack.common.news, newVersion, ioPack.common.news.NEXT);
                delete ioPack.common.news.NEXT;
            }
            else {
                console.log(`adding new news to io-package.json...`);
                try {
                    const translated = yield translate_1.translateText(newChangelog);
                    ioPack.common.news = tools_1.prependKey(ioPack.common.news, newVersion, translated);
                }
                catch (e) {
                    fail(`could not translate the news: ${e}`);
                }
                // If someone left this in here, also delete it
                delete ioPack.common.news.NEXT;
            }
            // Make sure we don't have too many keys
            if (Object.keys(ioPack.common.news).length > 20) {
                ioPack.common.news = tools_1.limitKeys(ioPack.common.news, 20);
            }
            fs.writeFileSync(ioPackPath, JSON.stringify(ioPack, null, 4));
        }
    }
    const execQueue = parseArgs_1.lerna
        ? [
            `git add -A -- ":(exclude).commitmessage"`,
            `git commit -F ".commitmessage" --no-verify`,
            // lerna does the rest for us
        ]
        : [
            isYarn ? `yarn install` : `npm install`,
            `git add -A -- ":(exclude).commitmessage"`,
            `git commit -F ".commitmessage"`,
            `git tag v${newVersion}`,
            `git push${parseArgs_1.remote ? ` ${parseArgs_1.remote.split("/").join(" ")}` : ""}`,
            `git push${parseArgs_1.remote ? ` ${parseArgs_1.remote.split("/").join(" ")}` : ""} --tags`,
        ];
    // Execute user scripts before pushing
    if (typeof parseArgs_1.scripts.beforePush === "string") {
        execQueue.unshift(parseArgs_1.scripts.beforePush);
    }
    else if (typeguards_1.isArray(parseArgs_1.scripts.beforePush)) {
        execQueue.unshift(...parseArgs_1.scripts.beforePush);
    }
    if (parseArgs_1.isDryRun) {
        console.log(safe_1.default.yellow("dry run:") + " I would execute this:");
        for (const command of execQueue) {
            console.log("  " + command);
        }
    }
    else {
        for (const command of execQueue) {
            console.log(`executing "${safe_1.default.blue(command)}" ...`);
            child_process_1.execSync(command, { cwd: rootDir });
        }
        // Delete the commit message file again
        try {
            fs.unlinkSync(path.join(rootDir, ".commitmessage"));
        }
        catch (e) {
            /* ignore */
        }
    }
    console.log("");
    console.log(safe_1.default.green("done!"));
    console.log("");
    process.exit(0);
}))().catch((e) => {
    console.error(e);
    process.exit(1);
});
