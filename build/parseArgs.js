"use strict";
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
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", { value: true });
exports.remote = exports.scripts = exports.allChanges = exports.isDryRun = exports.lerna = exports.lernaCheck = void 0;
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
// remote repo, can be set by remote flag - else we let it be falsy
const remote = yargs_1.argv.r;
exports.remote = remote;
// in lerna mode, these have no effect
const isDryRun = (_g = yargs_1.argv.dry) !== null && _g !== void 0 ? _g : yargs_1.argv._.includes("--dry");
exports.isDryRun = isDryRun;
const allChanges = (_j = (_h = rcFile === null || rcFile === void 0 ? void 0 : rcFile.all) !== null && _h !== void 0 ? _h : yargs_1.argv.all) !== null && _j !== void 0 ? _j : yargs_1.argv._.includes("--all");
exports.allChanges = allChanges;
