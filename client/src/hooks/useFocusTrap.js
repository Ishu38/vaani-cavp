import { useEffect } from "react";

// Note: the [tabindex] selector below is intentionally broad — we filter
// out negative tabindex values numerically below, since the CSS attribute
// selector `:not([tabindex='-1'])` only excludes the literal "-1" and lets
// "-2", "-3" etc. through.
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
].join(",");

const isPositiveTabbable = (el) => {
  if (!el.hasAttribute("tabindex")) return true; // matched by other selectors
  const ti = Number(el.getAttribute("tabindex"));
  return Number.isFinite(ti) && ti >= 0;
};

/**
 * Trap keyboard focus inside `containerRef` while `active` is true.
 * - Tab/Shift+Tab cycle within the container
 * - Esc fires `onEscape`
 * - On mount: focuses the first focusable element (or the container itself)
 * - On unmount: returns focus to the previously focused element
 */
export default function useFocusTrap(containerRef, { active = true, onEscape } = {}) {
  useEffect(() => {
    if (!active) return undefined;
    const node = containerRef.current;
    if (!node) return undefined;

    const previouslyFocused = typeof document !== "undefined" ? document.activeElement : null;

    const focusables = () =>
      Array.from(node.querySelectorAll(FOCUSABLE))
        .filter((el) => !el.hasAttribute("inert"))
        .filter(isPositiveTabbable);

    const initial = focusables()[0] || node;
    if (initial && typeof initial.focus === "function") {
      // Ensure the trap container can receive focus as a fallback
      if (initial === node && !node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
      initial.focus({ preventScroll: true });
    }

    const handler = (e) => {
      if (e.key === "Escape" && typeof onEscape === "function") {
        e.stopPropagation();
        onEscape(e);
        return;
      }
      if (e.key !== "Tab") return;
      // Always intercept Tab inside an active trap. Without preventDefault on
      // every tab keypress, focus could escape the container whenever
      // document.activeElement isn't currently in `items` — which happens
      // after dynamic content swaps, when the user clicks a non-focusable
      // backdrop, or right after the trap mounts before the initial focus
      // lands. We then redirect focus deterministically to the first/last
      // member of the trap.
      e.preventDefault();
      const items = focusables();
      if (items.length === 0) {
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const insideTrap = items.includes(active);
      if (!insideTrap) {
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        last.focus();
      } else if (!e.shiftKey && active === last) {
        first.focus();
      } else {
        // Inside the trap and not at an edge — let the browser's natural
        // tab order handle it by re-dispatching focus to next/prev item.
        const idx = items.indexOf(active);
        const next = e.shiftKey ? items[idx - 1] : items[idx + 1];
        next?.focus();
      }
    };

    node.addEventListener("keydown", handler);

    return () => {
      node.removeEventListener("keydown", handler);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef, onEscape]);
}
