const esbuild = require("esbuild");
const path = require("path");
const { glob, globSync, globStream, globStreamSync, Glob } = require("glob");

function resolveRoot(...segments) {
    return path.resolve(__dirname, "..", ...segments);
}

const entryPoints = globSync("../src/*.js", { cwd: __dirname });
console.log(entryPoints);

esbuild
    .build({
        outdir: resolveRoot("build"),
        entryPoints: entryPoints,
        bundle: true,
        minify: true,
        platform: "node",
        target: ["node10.4"],
    })
    .catch(console.log);
