import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	brandMarkRasterColors,
	renderBrandMarkSvg,
} from "../src/lib/brand-mark-graphic.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(scriptDir, "..", "public");
const svgPath = join(publicDir, "brand-mark.svg");

function run(command: string, args: string[]) {
	execFileSync(command, args, { stdio: "inherit" });
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(svgPath, renderBrandMarkSvg(brandMarkRasterColors));

run("rsvg-convert", [
	"-w",
	"192",
	"-h",
	"192",
	svgPath,
	"-o",
	join(publicDir, "logo192.png"),
]);
run("rsvg-convert", [
	"-w",
	"512",
	"-h",
	"512",
	svgPath,
	"-o",
	join(publicDir, "logo512.png"),
]);

const faviconPath = join(publicDir, "favicon.ico");
const favicon32Path = join(publicDir, ".favicon-32.png");
const favicon16Path = join(publicDir, ".favicon-16.png");

run("rsvg-convert", ["-w", "32", "-h", "32", svgPath, "-o", favicon32Path]);
run("rsvg-convert", ["-w", "16", "-h", "16", svgPath, "-o", favicon16Path]);
run("magick", [
	favicon32Path,
	favicon16Path,
	"-colors",
	"16",
	"-depth",
	"4",
	faviconPath,
]);

rmSync(favicon32Path, { force: true });
rmSync(favicon16Path, { force: true });

console.log(
	"Generated public/brand-mark.svg, logo192.png, logo512.png, favicon.ico",
);
