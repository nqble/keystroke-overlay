// =====================================================================================================================
//  The Animation tab (docs/design/ui-design-v2.md, Tabs): a gallery of animation cards, then Fine-tune: Speed, Strength
//  (only for animations that use it) and Easing, from the control table (CONTROLS in controls.js). The cards come from
//  the animation files the live preview reports (registry.animations), so a new file in ui/overlay/animations/ shows
//  up here by itself. Each card's demo uses that file's own output (the CSS variables overlay.js makes from it).
// =====================================================================================================================
import { GalleryCard, Section } from '../blocks.js';
import { ControlGroup } from '../controls.js';
import { html, useEffect, useState } from '../html.js';
import { changed } from '../preview.js';
import { registry, settings } from '../state.js';
import { TEXT } from '../text.js';
import { themeKeyVars } from '../themes.js';

const WORDS = {
  title: 'Animation',
  fineTune: 'Fine-tune',
};

// The demo: wait before starting so a pass-over does nothing (ui-design-v2.md, Hover delay), then press, hold, release
// and rest, over and over, only while the card is hovered or focused. No timer runs otherwise.
const HOVER_DELAY_MS = 150;
const HOLD_MS = 450;
const REST_MS = 700;

export function animationTab() {
  return html`<${Animation} />`;
}

function Animation() {
  const pick = (id) => {
    settings.animation.type = id;
    changed(true);
  };
  return html`<div class="tab-page">
    <div class="tab-heading">
      <h2 data-test="section-heading">${WORDS.title}</h2>
      <p class="note">${TEXT.animationTabNote}</p>
    </div>
    <div class="gallery" data-test="animation-cards">
      ${registry.animations.map(
        (animation) =>
          html`<${AnimationCard}
            key=${animation.id}
            animation=${animation}
            selected=${settings.animation.type === animation.id}
            onSelect=${() => pick(animation.id)}
          />`,
      )}
    </div>
    <div class="section-grid">
      <${Section} title=${WORDS.fineTune} test="animation-fine-tune">
        <${ControlGroup} tab="animation" group="Fine-tune" />
      <//>
    </div>
  </div>`;
}

function AnimationCard({ animation, selected, onSelect }) {
  const [active, setActive] = useState(''); // '', 'hover' or 'focus'
  const down = useDemoLoop(active);
  return html`<div
    class="gallery-item animation-item"
    data-animation=${animation.id}
    onMouseEnter=${() => setActive('hover')}
    onMouseLeave=${() => setActive('')}
    onFocusIn=${() => setActive('focus')}
    onFocusOut=${() => setActive('')}
  >
    <${GalleryCard}
      title=${animation.name}
      selected=${selected}
      onSelect=${onSelect}
      test=${'animation-card-' + animation.id}
    >
      <${AnimationDemo} vars=${animation.demo} down=${down} />
    <//>
  </div>`;
}

/** One key in the current look, animated by the animation's own CSS variables (blocks.css .anim-key). */
function AnimationDemo({ vars, down }) {
  const style = settings.style;
  return html`<span class="theme-stage">
    <span class=${down ? 'anim-key down' : 'anim-key'} style=${{ ...vars, '--glow-color': style.glowColor }}>
      <span class="anim-glow"></span>
      <span class="anim-face theme-key idle" style=${themeKeyVars(style, false)}>A</span>
      <span class="anim-face theme-key on" style=${themeKeyVars(style, true)}>A</span>
    </span>
  </span>`;
}

/**
 * While `active` is 'hover' or 'focus', returns true while the demo key is held down and false while it rests. Hover
 * waits HOVER_DELAY_MS first; keyboard focus starts at once. Every timer stops when `active` goes back to ''.
 */
function useDemoLoop(active) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!active) {
      setDown(false);
      return undefined;
    }
    let timer = 0;
    const press = () => {
      setDown(true);
      timer = setTimeout(release, HOLD_MS);
    };
    const release = () => {
      setDown(false);
      timer = setTimeout(press, REST_MS);
    };
    timer = setTimeout(press, active === 'hover' ? HOVER_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [active]);
  return down;
}
