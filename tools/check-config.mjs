// Checks that the places that name this app agree with each other (runs in CI):
//   app.config.json (read by the tools and tests), src-tauri/src/app_info.rs (read by the program),
//   src-tauri/tauri.conf.json, package.json and src-tauri/Cargo.toml.
// To make another program from this code, change app.config.json first, then fix whatever this check lists.
//   node tools/check-config.mjs
import { readFileSync } from 'node:fs';
import { APP } from './app-config.mjs';

const problems = [];
const read = (path) => readFileSync(path, 'utf8');
const expect = (where, found, wanted, what) => {
  if (found !== wanted)
    problems.push(`${where}: ${what} is ${JSON.stringify(found)}, app.config.json says ${JSON.stringify(wanted)}`);
};

// the program's own constants
const appInfo = read('src-tauri/src/app_info.rs');
const constant = (name) => appInfo.match(new RegExp(`pub const ${name}: &str = "([^"]*)";`))?.[1];
expect('src-tauri/src/app_info.rs', constant('NAME'), APP.name, 'NAME');
expect('src-tauri/src/app_info.rs', constant('REPO'), APP.repo, 'REPO');
expect('src-tauri/src/app_info.rs', constant('ID_APP'), APP.identifiers.app, 'ID_APP');
expect('src-tauri/src/app_info.rs', constant('ID_DEVBUILD'), APP.identifiers.devbuild, 'ID_DEVBUILD');
expect('src-tauri/src/app_info.rs', constant('LAYOUTS_FILE_TAG'), APP.layoutsFileTag, 'LAYOUTS_FILE_TAG');

// the Tauri configuration
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
expect('src-tauri/tauri.conf.json', tauri.productName, APP.name, 'productName');
expect('src-tauri/tauri.conf.json', tauri.identifier, APP.identifiers.app, 'identifier');
for (const endpoint of tauri.plugins?.updater?.endpoints ?? [])
  if (!endpoint.includes(`github.com/${APP.repo}/`))
    problems.push(`src-tauri/tauri.conf.json: update endpoint ${endpoint} does not point at ${APP.repo}`);

// the package and the crate
const pkg = JSON.parse(read('package.json'));
if (!String(pkg.repository?.url ?? '').includes(`github.com/${APP.repo}`))
  problems.push(`package.json: repository url ${pkg.repository?.url} does not point at ${APP.repo}`);
const cargoRepo = read('src-tauri/Cargo.toml').match(/^repository\s*=\s*"([^"]*)"/m)?.[1] ?? '';
if (!cargoRepo.includes(`github.com/${APP.repo}`))
  problems.push(`src-tauri/Cargo.toml: repository ${cargoRepo} does not point at ${APP.repo}`);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\nconfig check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`config check passed: ${APP.name} (${APP.repo}) is named the same everywhere it is configured`);
