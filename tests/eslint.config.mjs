// Only one rule: every name a page module uses is defined or imported. It
// catches an import lost when code moves between modules, which
// `node --check` does not.
//
//   npx -y eslint@9.13.0 -c tests/eslint.config.mjs public/js
const browser = ['window', 'document', 'location', 'navigator', 'performance', 'requestAnimationFrame', 'ResizeObserver', 'EventSource', 'localStorage', 'URLSearchParams', 'Notification', 'AudioContext', 'webkitAudioContext', 'matchMedia', 'HTMLElement', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'addEventListener', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', 'globalThis', 'URL']
export default [
  {
    files: ['public/js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: Object.fromEntries(browser.map(name => [name, 'readonly'])) },
    rules: { 'no-undef': 'error' },
  },
]
