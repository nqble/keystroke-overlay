// =====================================================================================================================
//  The General tab's Mouse card (docs/proposals/mouse-input.md, Settings window UI): one switch that shows the mouse
//  buttons and wheel. The command `set_mouse_input` starts or stops the capture and saves the setting itself, only after
//  the capture started, so a system without a method keeps the switch off and shows why. The app never sees where the
//  pointer is, and the note says so.
// =====================================================================================================================
import { Note, Section, Switch } from '../blocks.js';
import { invoke, toast } from '../helpers.js';
import { html, useState } from '../html.js';
import { settings } from '../state.js';
import { words } from '../words.js';

const WORDS = words('generalMouse');

/** Is the mouse input on, as saved? */
const mouseOn = () => settings.inputs?.mouse?.enabled === true;

export function MouseInput() {
  const [on, setOn] = useState(mouseOn());
  const [error, setError] = useState(null);
  const turn = async (want) => {
    try {
      await invoke('set_mouse_input', { enabled: want });
      settings.inputs ??= { mouse: {} };
      settings.inputs.mouse.enabled = want; // the command saved it; keep the window's copy the same
      setOn(want);
      setError(null);
    } catch (problem) {
      // the capture could not start: the switch stays off
      setOn(mouseOn());
      setError(String(problem));
      toast(String(problem), true);
    }
  };
  return html`<${Section} title=${WORDS.title} test="general-mouse">
    <${Switch} label=${WORDS.switch} checked=${on} onChange=${turn} test="mouse-switch" />
    ${error ? html`<div class="errnote" data-test="mouse-error">${error}</div>` : null}
    <${Note} text=${WORDS.note} />
  <//>`;
}
