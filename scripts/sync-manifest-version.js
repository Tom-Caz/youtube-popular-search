#!/usr/bin/env node
// Called by the npm `version` lifecycle hook. At that point npm has already
// updated package.json, so we just mirror the new version into manifest.json.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifestPath = path.join(root, "public", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest.json → ${version}`);
