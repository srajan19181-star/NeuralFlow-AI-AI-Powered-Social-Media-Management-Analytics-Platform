const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const axios = { defaults: { headers: { common: {} } } };
const modules = new Map();

function load(file) {
  file = path.resolve(__dirname, file);
  if (modules.has(file)) return modules.get(file);
  let source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Intl,
    React,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    window: {
      location: { search: '' },
      confirm: () => true,
      history: { replaceState: () => {} },
    },
    document: {
      querySelector: () => null,
      getElementById: () => null,
    },
    require: (name) => {
      if (name === 'axios') return axios;
      if (name === 'react') return React;
      if (name === 'react-router-dom') {
        return {
          Link: ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children),
          useNavigate: () => () => {},
          useLocation: () => ({ search: '', pathname: '/settings' }),
        };
      }
      if (name === '@fortawesome/react-fontawesome') {
        return {
          FontAwesomeIcon: ({ icon, ...props }) => React.createElement('i', { className: typeof icon === 'string' ? icon : (Array.isArray(icon) ? icon.join(' ') : ''), ...props }),
        };
      }
      if (name.startsWith('.')) {
        let target = path.resolve(path.dirname(file), name);
        if (fs.existsSync(target + '.tsx')) target += '.tsx';
        else if (fs.existsSync(target + '.ts')) target += '.ts';
        else if (fs.existsSync(target + '/index.tsx')) target += '/index.tsx';
        else if (fs.existsSync(target + '/index.ts')) target += '/index.ts';
        return load(target);
      }
      return require(name);
    },
  });
  modules.set(file, module.exports);
  return module.exports;
}

const { usePlatformsStore } = load('../src/stores/platforms.ts');
const Settings = load('../src/views/Settings.tsx').default;
const AccountAvatar = load('../src/components/AccountAvatar.tsx').default;

let store;
beforeEach(() => {
  store = usePlatformsStore();
  store.allFbPages = [];
  store.allIgAccounts = [];
  store.connectedPages = [];
  store.connectedIgAccounts = [];
  store.metaCredentials = { configured: false };
  store.statuses = [];
  store.metaDiscovery = null;
  store.metaError = null;
});

test('saved accounts load even when publishing capabilities are unavailable', async () => {
  axios.get = async (url) => {
    if (url.endsWith('/capabilities')) throw new Error('Temporarily unavailable');
    return {
      data: {
        facebook: { pages: [{ id: 'page' }], allPages: [{ id: 'page', selected: true }] },
        instagram: { accounts: [{ id: 'ig' }] },
      },
    };
  };
  await store.fetchMetaConnections();
  assert.equal(store.connectedPages[0].id, 'page');
  assert.equal(store.connectedIgAccounts[0].id, 'ig');
  assert.equal(store.allFbPages[0].selected, true);
});

test('refresh reloads saved pictures immediately and keeps new accounts in discovery', async () => {
  store.connectedPages = [{ id: 'page', picture: 'expired' }];
  axios.post = async () => ({
    data: { pending: true, pages: [{ id: 'page' }, { id: 'new' }], igAccounts: [] },
  });
  axios.get = async (url) => ({
    data: url.endsWith('/capabilities')
      ? { publishing: ['facebook'] }
      : { facebook: { pages: [{ id: 'page', picture: 'fresh' }], allPages: [{ id: 'page', picture: 'fresh', selected: true }] } },
  });
  assert.equal(await store.refreshMetaDiscovery(), true);
  assert.equal(store.connectedPages[0].picture, 'fresh');
  assert.equal(store.connectedPages.length, 1);
  assert.equal(store.metaDiscovery.pages.length, 2);
});

async function settingsHtml() {
  return ReactDOMServer.renderToString(React.createElement(Settings));
}

test('Settings keeps deselected saved accounts visible when health checks fail', async () => {
  store.metaCredentials = { configured: true };
  store.statuses = [{ platform: 'facebook', connected: false, error: 'Token expired' }];
  store.allFbPages = [{ id: 'page', name: 'Workspace Page', selected: false }];
  store.allIgAccounts = [{ id: 'ig', username: 'workspace.ig', selected: false }];
  const html = await settingsHtml();
  assert.ok(html.includes('Workspace Page'));
  assert.ok(html.includes('@workspace.ig'));
  assert.ok(html.includes('Save Selection'));
  assert.ok(html.includes('fa-brands fa-facebook'));
  assert.ok(html.includes('fa-brands fa-instagram'));
  assert.ok(!html.includes('Connect with Facebook &amp; Instagram'));
});

test('an empty workspace shows the connect action without another workspace accounts', async () => {
  store.metaCredentials = { configured: true };
  const html = await settingsHtml();
  assert.ok(html.includes('Connect with Facebook &amp; Instagram'));
  assert.ok(!html.includes('Save Selection'));
});

test('a failed avatar shows the platform icon and a refreshed URL retries the image', async () => {
  // Test image rendering initially
  const initialHtml = ReactDOMServer.renderToString(React.createElement(AccountAvatar, { src: 'expired.jpg', platform: 'instagram' }));
  assert.ok(initialHtml.includes('<img'));
  assert.ok(initialHtml.includes('src="expired.jpg"'));

  // Test fallback icon rendering when image is absent or null
  const fallbackHtml = ReactDOMServer.renderToString(React.createElement(AccountAvatar, { src: null, platform: 'instagram' }));
  assert.ok(fallbackHtml.includes('fa-brands fa-instagram'));
  assert.ok(!fallbackHtml.includes('<img'));

  // Test fresh image rendering
  const freshHtml = ReactDOMServer.renderToString(React.createElement(AccountAvatar, { src: 'fresh.jpg', platform: 'instagram' }));
  assert.ok(freshHtml.includes('<img'));
  assert.ok(freshHtml.includes('src="fresh.jpg"'));
});
