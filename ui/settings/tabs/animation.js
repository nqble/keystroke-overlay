// =====================================================================================================================
//  The Animation tab.
// =====================================================================================================================
import { renderControls } from '../controls.js';
import { el, note } from '../helpers.js';
import { TEXT } from '../text.js';

// ---- Animation ----------------------------------------------------------------------------------------------------
export function animationTab() {
  const page = el('div');
  renderControls('animation', page);
  page.append(note(TEXT.animationTabNote));
  return page;
}
