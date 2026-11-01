// =====================================================================================================================
//  One press on a Layout tab card, from pointerdown until the click after it: is it a click or a drag, which card is
//  dragged, over which gap, and must the next click be swallowed? Plain JavaScript with no Preact, so the edge cases
//  (a canceled drag, a fast flick, a second finger) have unit tests (tests/ui/drag-press.test.mjs). The Layout tab's
//  useDrag (tabs/layout.js) turns its answers into what the page shows.
// =====================================================================================================================
import { isDragStart } from './layout-order.js';

/**
 * A fresh tracker. Every pointer method takes the event's pointerId and ignores pointers other than the pressed one; a
 * new press always replaces the old one, so a press whose end never arrived can't block the next.
 */
class DragPress {
  press = null; // { layoutId, x, y, pointerId, dragging, gap } from pointerdown until pointerup or cancel
  swallowNextClick = false; // true from a drag's end until the click the browser sends after it

  own(pointerId) {
    return this.press !== null && this.press.pointerId === pointerId;
  }
  get dragId() {
    return this.press?.dragging ? this.press.layoutId : null;
  }
  down(layoutId, x, y, pointerId) {
    this.press = { layoutId, x, y, pointerId, dragging: false, gap: null };
    this.swallowNextClick = false;
  }
  /** True when this move turned the press into a drag (or it already was one). */
  move(x, y, pointerId) {
    if (!this.own(pointerId)) return false;
    if (!this.press.dragging && isDragStart(this.press, x, y)) this.press.dragging = true;
    return this.press.dragging;
  }
  setGap(gap) {
    if (this.press?.dragging) this.press.gap = gap;
  }
  /** Ends the press. Returns { layoutId, gap } when a drag ended over a gap (save the new order), otherwise null. */
  up(pointerId) {
    if (!this.own(pointerId)) return null;
    const ended = this.press;
    this.press = null;
    this.swallowNextClick = ended.dragging;
    return ended.dragging && ended.gap !== null ? { layoutId: ended.layoutId, gap: ended.gap } : null;
  }
  /** The system took the pointer away (pointercancel): no click follows, so nothing is left to swallow. */
  cancel(pointerId) {
    if (!this.own(pointerId)) return;
    this.press = null;
    this.swallowNextClick = false;
  }
  /**
   * The card lost the pointer capture. After a normal pointerup this comes just before the click, so the click must
   * still be swallowed; without a pointerup (the card was redrawn), the press simply ends.
   */
  lostCapture(pointerId) {
    if (this.own(pointerId)) this.press = null;
  }
  /** True once for the mouse click a drag ends with. A keyboard click (Enter, Space: detail 0) is never swallowed. */
  swallowClick(clickDetail) {
    const swallow = this.swallowNextClick && clickDetail > 0;
    this.swallowNextClick = false;
    return swallow;
  }
}

export const createDragPress = () => new DragPress();
