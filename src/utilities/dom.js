export const $ = (root, sel) => root.querySelector(sel);

export const $$ = (root, sel) =>
  Array.from(root.querySelectorAll(sel));

export const on = (el, ev, fn, opts) =>
  el && el.addEventListener(ev, fn, opts);

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};