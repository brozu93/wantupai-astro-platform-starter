// opentype.js ships no type declarations. It is only used by scripts/build-font-data.mjs,
// which runs at authoring time, so an opaque module declaration is enough to keep the
// project typecheck clean without pulling in a hand-written API surface.
declare module 'opentype.js';
