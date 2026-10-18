// The values that belong to THIS app (its name, repository, identifiers, test app names), read from app.config.json at the
// root. The tools and tests import APP from here instead of spelling them out. See app.config.json and `npm run check:config`.
import { readFileSync } from 'node:fs';

export const APP = JSON.parse(readFileSync(new URL('../app.config.json', import.meta.url), 'utf8'));
