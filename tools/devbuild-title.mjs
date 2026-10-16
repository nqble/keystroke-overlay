// Adds the purple DEV badge after the app name in the settings header (used by tools/devbuild.mjs and the UI sandbox's
// ?devbuild view). Its look is .dev-badge in ui/settings/settings.css.
// It finds the name by its test hook, data-test="brand-title" (tests/README.md), not by the tag's other attributes, so
// adding or reordering attributes can't break the devbuild again. tests/ui/devbuild-title.test.mjs runs it against the
// real ui/settings/index.html.

// The formatter may wrap the tag over several lines, so whitespace is allowed anywhere inside it.
const HEADER_TITLE = /(<span\b[^>]*\bdata-test="brand-title"[^>]*>\s*Keystroke Overlay)(\s*<\/span\s*>)/;
const DEVBUILD_LABEL = ' <span class="dev-badge" data-test="dev-badge">DEV</span>';

/** The settings page with the badge added. Throws if the header's title can't be found, so the build stops early. */
export function addDevbuildLabel(html) {
  if (!HEADER_TITLE.test(html)) throw new Error('the header markup changed: update tools/devbuild-title.mjs');
  return html.replace(HEADER_TITLE, `$1${DEVBUILD_LABEL}$2`);
}
