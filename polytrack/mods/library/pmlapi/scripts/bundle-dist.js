import fs from "fs";
import path from "path";
import { buildSync } from "esbuild";

const DIST = path.join(process.cwd(), "dist");
const MAIN = "pml-api.mod.js";

// this script just walks through each version folder in the dist directory
// and combines all the JS files into a single minified file named pml-api.mod.js

const minify = process.argv.includes("--minify");

function processFolder(folder) {
    // if minify is true, we will put this in a dist/release folder else we will put it in dist/debug
    // if minify, check if dist/release exists, if not create it
    let outFolder;
    if (minify) {
        const releaseFolder = path.join(DIST, "release");
        if (!fs.existsSync(releaseFolder)) {
            fs.mkdirSync(releaseFolder, { recursive: true });
        }
        outFolder = releaseFolder;
    } else {
        const debugFolder = path.join(DIST, "debug");
        if (!fs.existsSync(debugFolder)) {
            fs.mkdirSync(debugFolder, { recursive: true });
        }
        outFolder = debugFolder;
    }

    outFolder = path.join(outFolder, path.basename(folder));

    buildSync({
        entryPoints: [path.join(folder, MAIN)],
        outfile: path.join(outFolder, MAIN),
        bundle: true,
        minify,
        format: "esm",
        target: "es2020",
        sourcemap: false,
        logLevel: "info",
        allowOverwrite: true,
    });

    fs.readdirSync(folder).forEach((file) => {
        if (file !== MAIN && file.endsWith(".js")) {
            fs.unlinkSync(path.join(folder, file));
        }
    });

    // remove the folder
    fs.rmSync(folder, { recursive: true });

    console.log(`Processed: ${path.basename(folder)}`);
}

function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
        const full = path.join(dir, d.name);
        if (d.isDirectory() && d.name !== "debug" && d.name !== "release") {
            processFolder(full);
        }
    });
}

walk(DIST);
