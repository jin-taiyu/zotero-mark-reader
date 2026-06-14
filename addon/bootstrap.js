var ZoteroMarkReader;
var chromeHandle;

function log(message) {
  Zotero.debug(`Zotero Mark Reader: ${message}`);
}

function install() {
  log("Installed");
}

async function startup({ id, version, resourceURI, rootURI }) {
  log("Starting");
  if (!rootURI) {
    rootURI = resourceURI.spec;
  }
  var addonManagerStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  chromeHandle = addonManagerStartup.registerChrome(
    Services.io.newURI(`${rootURI}manifest.json`),
    [["content", "zotero-mark-reader", `${rootURI}content/`]],
  );
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
  chromeHandle?.destruct();
  chromeHandle = undefined;
}

function uninstall() {
  log("Uninstalled");
}
