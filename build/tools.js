"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const objects_1 = require("alcalzone-shared/objects");
/** Extracts the current (work in progress) changelog from the complete changelog text */
function extractCurrentChangelog(changelogText, versionHeaderPrefix, nextVersionPlaceholderRegex) {
    const match = nextVersionPlaceholderRegex.exec(changelogText);
    if (!match)
        return;
    const start = match.index + match[0].length;
    let end = changelogText.indexOf(
    // Avoid matching sub-headlines
    versionHeaderPrefix + " ", start);
    if (end === -1)
        end = undefined;
    return changelogText.substring(start, end).trim();
}
exports.extractCurrentChangelog = extractCurrentChangelog;
function prependKey(obj, newKey, value) {
    const ret = { [newKey]: value };
    for (const [k, v] of objects_1.entries(obj)) {
        ret[k] = v;
    }
    return ret;
}
exports.prependKey = prependKey;
function limitKeys(obj, count) {
    const ret = {};
    for (const [k, v] of objects_1.entries(obj).slice(0, count)) {
        ret[k] = v;
    }
    return ret;
}
exports.limitKeys = limitKeys;
