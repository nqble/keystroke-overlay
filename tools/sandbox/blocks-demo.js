// The examples on /__sandbox__/blocks.html (see that file). Each block appears with real state, so every state can be
// reached: hover, press and hold, keyboard focus, on and off, selected and not.
import { GalleryCard, MenuButton, Section, Segmented, Switch } from '/blocks.js';
import { html, render, useState } from '/html.js';

const MENU = [{ label: 'Rename' }, { label: 'Duplicate' }, { label: 'Delete…', danger: true }];

function Demo() {
  const [startup, setStartup] = useState(true);
  const [tray, setTray] = useState(false);
  const [channel, setChannel] = useState('stable');
  const [method, setMethod] = useState('hook');
  const [card, setCard] = useState('tkl');
  return html`<div class="sandbox-grid">
    <${Section} title="Switches" test="demo-section">
      <${Switch} label="Start with Windows" checked=${startup} onChange=${setStartup} test="demo-switch-on" />
      <${Switch} label="Close to the tray" checked=${tray} onChange=${setTray} test="demo-switch-off" />
    <//>
    <${Section} title="Segmented choices">
      <${Segmented}
        label="Update channel"
        value=${channel}
        onChange=${setChannel}
        test="demo-segmented"
        choices=${[
          { value: 'stable', text: 'Stable' },
          { value: 'latest', text: 'Latest' },
        ]}
      />
      <${Segmented}
        label="Keyboard input"
        value=${method}
        onChange=${setMethod}
        choices=${[
          { value: 'hook', text: 'Standard' },
          { value: 'rawinput', text: 'Compatibility' },
        ]}
      />
    <//>
    <${Section} title="Gallery cards">
      <div class="sandbox-cards">
        ${['full', 'tkl', 'wasd'].map(
          (id) =>
            html`<${GalleryCard}
              title=${id.toUpperCase()}
              detail="Built in"
              selected=${card === id}
              onSelect=${() => setCard(id)}
              test=${'demo-card-' + id}
              menu=${{ label: `More for ${id}`, items: MENU, test: 'demo-card-menu-' + id }}
            />`,
        )}
      </div>
    <//>
    <${Section} title="Menu button">
      <div><${MenuButton} label="More" items=${MENU} test="demo-menu" /></div>
    <//>
  </div>`;
}

render(html`<${Demo} />`, document.getElementById('blocks'));
