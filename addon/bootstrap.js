var ZoteroMarkReader;

function log(message) {
  Zotero.debug(`Zotero Mark Reader: ${message}`);
}

function install() {
  log("Installed");
}

async function startup({ id, version, rootURI }) {
  log("Starting");
  Services.scriptloader.loadSubScript(
    `${rootURI}content/scripts/zotero-mark-reader.js`,
  );
  ZoteroMarkReader.init({ id, version, rootURI });
  await Zotero.PreferencePanes.register({
    pluginID: id,
    src: `${rootURI}content/preferences/preferences.xhtml`,
    scripts: [`${rootURI}content/preferences/preferences.js`],
    label: "Mark Reader",
  });
  await ZoteroMarkReader.startup();
}

function onMainWindowLoad({ window }) {
  ZoteroMarkReader?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  ZoteroMarkReader?.onMainWindowUnload(window);
}

function shutdown() {
  log("Shutting down");
  ZoteroMarkReader?.shutdown();
  ZoteroMarkReader = undefined;
}

function uninstall() {
  log("Uninstalled");
}
