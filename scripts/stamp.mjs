// R6: copies app/ to dist/ and stamps the build's git sha into <meta name="build"> and the footer.
// Usage: node scripts/stamp.mjs [sha]   (defaults to `git rev-parse HEAD`, or $GITHUB_SHA in Actions)
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sha = process.argv[2] || process.env.GITHUB_SHA || execSync('git rev-parse HEAD').toString().trim();
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`not a full git sha: ${sha}`);

rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes('__BUILD_SHA__')) throw new Error('no __BUILD_SHA__ placeholder in index.html');
writeFileSync('dist/index.html', html.replaceAll('__BUILD_SHA__', sha));
console.log(`stamped dist/ with build ${sha}`);
