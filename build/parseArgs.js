"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = require("yargs");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Try to read the CLI args from an RC file
let rcFile;
const rcFileName = (_a = yargs_1.argv.c) !== null && _a !== void 0 ? _a : ".releaseconfig.json";
const rcFilePath = path.isAbsolute(rcFileName)
    ? rcFileName
    : path.join(process.cwd(), rcFileName);
if (fs.existsSync(rcFilePath)) {
    try {
        rcFile = require(rcFilePath);
    }
    catch (_k) { }
}
// Scripts can only provided through an RC file
const scripts = (_b = rcFile === null || rcFile === void 0 ? void 0 : rcFile.scripts) !== null && _b !== void 0 ? _b : {};
exports.scripts = scripts;
// lerna mode offloads bumping the versions to lerna.
// it implies --all, since that is what lerna does
const lernaCheck = (_d = (_c = yargs_1.argv.lernaCheck) !== null && _c !== void 0 ? _c : yargs_1.argv["lerna-check"]) !== null && _d !== void 0 ? _d : yargs_1.argv._.includes("--lerna-check");
exports.lernaCheck = lernaCheck;
const lerna = lernaCheck || ((_f = (_e = rcFile === null || rcFile === void 0 ? void 0 : rcFile.lerna) !== null && _e !== void 0 ? _e : yargs_1.argv.lerna) !== null && _f !== void 0 ? _f : yargs_1.argv._.includes("--lerna"));
exports.lerna = lerna;
// in lerna mode, these have no effect
const isDryRun = (_g = yargs_1.argv.dry) !== null && _g !== void 0 ? _g : yargs_1.argv._.includes("--dry");
exports.isDryRun = isDryRun;
const allChanges = (_j = (_h = rcFile === null || rcFile === void 0 ? void 0 : rcFile.all) !== null && _h !== void 0 ? _h : yargs_1.argv.all) !== null && _j !== void 0 ? _j : yargs_1.argv._.includes("--all");
exports.allChanges = allChanges;
