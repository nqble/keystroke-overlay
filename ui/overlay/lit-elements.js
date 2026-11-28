// Which elements light up for each key code on the overlay (used by overlay.js). One code can light several: a key of
// the layout and a part of a drawn mouse that follows the same key (an extra button assigned that key, devices.js), or
// two extra buttons assigned the same key. Plain logic with no page code, so tests/ui/lit-elements.test.mjs runs it.

/** An empty registry: `add` an element for a code, `light` every element of a code, `darkenAll` everything. */
export function createLitElements() {
  const byCode = new Map(); // code -> the elements that light for it, in the order they were added

  const add = (code, element) => {
    const elements = byCode.get(code) ?? [];
    elements.push(element);
    byCode.set(code, elements);
  };

  const light = (code, down) => {
    for (const element of byCode.get(code) ?? []) element.classList.toggle('down', down);
  };

  const darkenAll = () => {
    for (const elements of byCode.values()) {
      for (const element of elements) element.classList.remove('down');
    }
  };

  return { add, light, darkenAll, clear: () => byCode.clear() };
}
