// shortcut for querySelector in shadowDom
export const $ = (root, sel) => root.querySelector(sel);

// shortcut for querySelectorAll in shadowDom, turns result into an array
export const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

// if el exists, attaches event listener to el
export const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

// limits how often a function is called, sets a timer and function can only be called again after timer is complete
export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
