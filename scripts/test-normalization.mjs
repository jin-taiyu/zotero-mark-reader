import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(root, "src", "zotero-mark-reader.js"), "utf8");
const bootstrapSource = await readFile(join(root, "addon", "bootstrap.js"), "utf8");
const taskWindowSource = await readFile(
  join(root, "addon", "content", "translation-task.xhtml"),
  "utf8",
);
const ioCalls = [];
const sandbox = {
  process: { env: { ZMR_TEST: "1" } },
  TextEncoder,
  AbortController,
  DOMException,
  setTimeout,
  clearTimeout,
  IOUtils: {
    async writeUTF8(path) {
      ioCalls.push(["writeUTF8", path]);
    },
    async move(sourcePath, targetPath) {
      ioCalls.push(["move", sourcePath, targetPath]);
    },
    async remove(path) {
      ioCalls.push(["remove", path]);
    },
  },
  Zotero: {
    debug() {},
    logError() {},
    Prefs: { get() {} },
    Promise: { delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) },
    getMainWindow() {
      return { AbortController, setTimeout, clearTimeout };
    },
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, {
  filename: "zotero-mark-reader.js",
});

assert.match(
  bootstrapSource,
  /registerChrome\([\s\S]*\["content", "zotero-mark-reader"/,
);
assert.match(
  source,
  /openDialog\(\s*"chrome:\/\/zotero-mark-reader\/content\/translation-task\.xhtml"/,
);
assert.match(
  source,
  /await task\.initialize\(\);\s*await task\.prepare\(\);/,
);
assert.doesNotMatch(taskWindowSource, /titlebar\.js/);
assert.match(source, /parseButton\.addEventListener\("click", \(\) => this\.parseCurrentPDF\(\)\)/);
assert.match(
  source,
  /fullTranslateButton\.addEventListener\("click", \(\) => this\.translateCurrentPDF\(\)\)/,
);
assert.match(source, /await parseItems\(\[attachment\]\)/);
assert.match(source, /await translateParagraphsForItems\(\[attachment\]\)/);

const {
  markdownFromV2Item,
  markdownFromLegacyItem,
  normalizeModelJSON,
  parseChatCompletionStreamEvent,
  parseChatCompletionText,
  renderPromptTemplate,
  renderTranslationPrompt,
  renderMarkdown,
  createMultipartBody,
  stableStringify,
  writeJSON,
  isTranslatableBlock,
  hasNaturalLanguage,
  blockContext,
  normalizeGlossaryEntries,
  mergeGlossaries,
  filterGlossaryForTarget,
  normalizeTranslationCache,
  translationFingerprint,
  findCachedTranslation,
  storeCachedTranslation,
  migrateLegacyTranslations,
  createTranslationBatches,
  parseBatchTranslations,
  parseJSONPayload,
  createTimedRequestSignal,
  FullTranslationTask,
} = sandbox.ZoteroMarkReader.__test;

const glossarySource = await readFile(
  join(root, "addon", "content", "translation-task.js"),
  "utf8",
);
const glossarySandbox = {
  ChromeUtils: {
    importESModule() {
      return { FilePicker: class {} };
    },
  },
};
vm.createContext(glossarySandbox);
vm.runInContext(glossarySource, glossarySandbox, {
  filename: "translation-task.js",
});
assert.doesNotMatch(glossarySource, /\.innerHTML\s*=/);
assert.doesNotMatch(glossarySource, /dataset\.(?:origin|originalSource)/);
assert.doesNotMatch(glossarySource, /placeholder\s*=\s*["']AI 生成["']/);

assert.equal(
  markdownFromV2Item({
    type: "paragraph",
    content: {
      paragraph_content: [
        { type: "text", content: "Let " },
        { type: "inline_equation", content: "E=mc^2" },
        { type: "text", content: " hold." },
      ],
    },
  }),
  "Let $E=mc^2$ hold.",
);

assert.equal(
  markdownFromV2Item({
    type: "paragraph",
    content: {
      paragraph_content: [
        { type: "text", content: "The price is $5, not a formula." },
      ],
    },
  }),
  "The price is $5, not a formula.",
);

assert.equal(
  markdownFromV2Item({
    type: "equation_interline",
    content: {
      math_content: "Q _ { \\% } = f(P)",
    },
  }),
  "$$\nQ _ { \\% } = f(P)\n$$",
);

assert.equal(
  markdownFromV2Item({
    type: "equation_interline",
    content: {
      math_content: "\\[a^2+b^2=c^2\\]",
    },
  }),
  "$$\na^2+b^2=c^2\n$$",
);

assert.equal(
  markdownFromV2Item({
    type: "equation_interline",
    content: {
      math_content: [{ type: "interline_equation", content: "y = mx + b" }],
    },
  }),
  "$$\ny = mx + b\n$$",
);

assert.equal(
  markdownFromLegacyItem({
    type: "equation",
    text: "x = y + z",
  }),
  "$$\nx = y + z\n$$",
);

const modelBlocks = normalizeModelJSON(
  [[{ type: "equation", bbox: [0.1, 0.2, 0.3, 0.4], content: "F=ma" }]],
  { key: "ABCD1234" },
  "hash",
);
assert.equal(modelBlocks[0].markdown, "$$\nF=ma\n$$");

assert.match(renderMarkdown("\\[x+y\\]"), /zmr-math-fallback/);

assert.equal(
  JSON.stringify(
    parseChatCompletionStreamEvent(
      'data: {"choices":[{"delta":{"content":"甲"}}]}\n\n',
    ),
  ),
  JSON.stringify({ done: false, delta: "甲" }),
);

assert.equal(
  JSON.stringify(parseChatCompletionStreamEvent("data: [DONE]\n\n")),
  JSON.stringify({ done: true, delta: "" }),
);

assert.equal(
  parseChatCompletionText(
    'data: {"choices":[{"delta":{"content":"甲"}}]}\n\ndata: {"choices":[{"delta":{"content":"乙"}}]}\n\n',
  ),
  "甲乙",
);

assert.equal(
  renderPromptTemplate("Translate {{ text }} into {{target_language}}.", {
    target_language: "English",
    text: "你好",
  }),
  "Translate 你好 into English.",
);

assert.equal(
  renderTranslationPrompt("Translate to {{target_language}}.", {
    target_language: "English",
    text: "你好",
  }),
  "Translate to English.\n\n<translate_input>\n你好\n</translate_input>",
);

assert.equal(
  renderTranslationPrompt("Translate {{text}}.", {
    target_language: "English",
    text: "你好",
    context: "Academic paper.",
    glossary: "- model => 模型",
  }),
  "Translate 你好.\n\n<translation_context>\nAcademic paper.\n</translation_context>\n\n<translation_glossary>\n- model => 模型\n</translation_glossary>",
);

assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
await writeJSON("/cache/translation-cache.json", { entries: {} });
assert.deepEqual(ioCalls, [
  ["writeUTF8", "/cache/translation-cache.json.tmp"],
  ["move", "/cache/translation-cache.json.tmp", "/cache/translation-cache.json"],
]);
assert.equal(isTranslatableBlock({ type: "title", markdown: "# Intro" }), true);
assert.equal(isTranslatableBlock({ type: "table", markdown: "| A |" }), true);
assert.equal(isTranslatableBlock({ type: "page_header", markdown: "Header" }), false);
assert.equal(isTranslatableBlock({ type: "equation", markdown: "$$x$$" }), false);
assert.equal(isTranslatableBlock({ type: "paragraph", markdown: "$$x + y = 1$$" }), false);
assert.equal(isTranslatableBlock({ type: "table", markdown: "| 1 | 2 |" }), false);
assert.equal(hasNaturalLanguage("中文和 English"), true);
assert.equal(hasNaturalLanguage("`x` 123"), false);
assert.equal(hasNaturalLanguage("$$x + y$$ 123"), false);
assert.equal(
  blockContext(
    [{ markdown: "Before" }, { markdown: "Current" }, { markdown: "After" }],
    1,
    { summary: "Summary" },
    { contextEnabled: false, expertMode: "general" },
  ),
  "",
);
assert.match(
  blockContext(
    [{ markdown: "Before" }, { markdown: "Current" }, { markdown: "After" }],
    1,
    { summary: "Summary" },
    { contextEnabled: true, expertMode: "general" },
  ),
  /Previous source block: Before/,
);

const mergedGlossary = mergeGlossaries(
  [{ source: "model", target: "全局模型", enabled: true, origin: "global" }],
  [{ source: "model", target: "AI 模型", enabled: true, origin: "document-ai" }],
  [{ source: "model", target: "人工模型", enabled: true, origin: "document-manual" }],
);
assert.equal(mergedGlossary.length, 1);
assert.equal(mergedGlossary[0].target, "人工模型");
assert.equal(
  mergeGlossaries(
    filterGlossaryForTarget(
      [
        {
          source: "model",
          target: "全局模型",
          targetLanguage: "简体中文",
          enabled: true,
        },
      ],
      "简体中文",
    ),
    [],
    filterGlossaryForTarget(
      [
        {
          source: "model",
          target: "manual model",
          targetLanguage: "English",
          enabled: true,
        },
      ],
      "简体中文",
    ),
  )[0].target,
  "全局模型",
);
assert.equal(
  normalizeGlossaryEntries([{ source: " term ", target: " 术语 ", enabled: false }])[0]
    .enabled,
  false,
);

const translationConfig = {
  provider: "OpenRouter",
  model: "model-a",
  targetLanguage: "简体中文",
  systemPrompt: "Translate {{text}}",
  expertMode: "auto",
  expertCustom: "",
};
const cacheBlock = { id: "block-1", markdown: "A model." };
const cache = { entries: {} };
const firstFingerprint = translationFingerprint(cacheBlock, translationConfig, {
  context: "context-a",
  glossary: [],
});
const secondFingerprint = translationFingerprint(
  cacheBlock,
  { ...translationConfig, model: "model-b" },
  { context: "context-a", glossary: [] },
);
assert.notEqual(firstFingerprint, secondFingerprint);
storeCachedTranslation(cache, cacheBlock, translationConfig, "一个模型。", {
  context: "context-a",
  glossary: [],
});
assert.equal(
  findCachedTranslation(
    cache,
    cacheBlock,
    translationConfig,
    { context: "context-a", glossary: [] },
    { allowLegacy: false },
  ).markdown,
  "一个模型。",
);
assert.equal(
  findCachedTranslation(
    cache,
    cacheBlock,
    { ...translationConfig, model: "model-b" },
    { context: "context-a", glossary: [] },
    { allowLegacy: false },
  ),
  null,
);

const legacyCache = { entries: {} };
assert.equal(
  migrateLegacyTranslations(
    {
      blocks: [
        {
          id: "legacy-1",
          translation: {
            markdown: "旧译文",
            provider: "OpenRouter",
            model: "old-model",
          },
        },
      ],
    },
    legacyCache,
  ),
  true,
);
assert.equal(Object.values(legacyCache.entries["legacy-1"])[0].legacy, true);
const reparsedCache = normalizeTranslationCache(
  {
    sourceHash: "old",
    analyses: { old: { summary: "old" } },
    entries: { "block-1": { version: { markdown: "保留译文" } } },
  },
  { key: "ATTACHMENT" },
  { sourceHash: "new" },
);
assert.deepEqual(Object.keys(reparsedCache.analyses), []);
assert.equal(reparsedCache.entries["block-1"].version.markdown, "保留译文");

const batches = createTranslationBatches(
  [
    { block: { markdown: "1234" } },
    { block: { markdown: "5678" } },
    { block: { markdown: "90" } },
  ],
  2,
  6,
);
assert.equal(batches.length, 2);
assert.equal(
  JSON.stringify(
    parseJSONPayload('```json\n{"translations":[{"id":"a","markdown":"甲"}]}\n```'),
  ),
  JSON.stringify({ translations: [{ id: "a", markdown: "甲" }] }),
);
assert.equal(
  JSON.stringify(
    parseBatchTranslations('{"translations":[{"id":"a","markdown":"甲"}]}', [
      { block: { id: "a" } },
    ]),
  ),
  JSON.stringify([{ id: "a", markdown: "甲" }]),
);
assert.equal(
  JSON.stringify(
    parseBatchTranslations(
      '{"translations":[{"id":"a","markdown":"甲"},{"id":"a","markdown":"乙"}]}',
      [{ block: { id: "a" } }],
    ),
  ),
  JSON.stringify([]),
);

const task = new FullTranslationTask([], translationConfig);
assert.equal(task.snapshot().stats.inProgress, 0);
task.status = "running";
task.abortController = new AbortController();
task.pause();
assert.equal(task.status, "paused");
task.resume();
assert.equal(task.status, "running");
task.cancel();
assert.equal(task.status, "cancelled");
assert.equal(task.phase, "cancelled");
assert.match(task.activity, /已取消/);
assert.equal(task.abortController.signal.aborted, true);

const timedSignal = createTimedRequestSignal(undefined, 5);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(timedSignal.signal.aborted, true);
assert.equal(timedSignal.timedOut(), true);
timedSignal.cleanup();

const emptyTask = new FullTranslationTask([], translationConfig);
await emptyTask.initialize();
assert.equal(emptyTask.phase, "ready");
assert.equal(emptyTask.analysisReady, false);
assert.equal(emptyTask.start(), null);
await emptyTask.prepare();
assert.equal(emptyTask.status, "ready");
assert.equal(emptyTask.analysisReady, true);
assert.match(emptyTask.activity, /未找到可翻译内容/);
await emptyTask.start();
assert.equal(emptyTask.status, "completed");
assert.equal(emptyTask.phase, "completed");

const listenerFailureTask = new FullTranslationTask([], translationConfig);
let listenerFailureNotifications = 0;
listenerFailureTask.subscribe(() => {
  listenerFailureNotifications++;
  throw new Error("render failed");
});
await listenerFailureTask.initialize();
await listenerFailureTask.prepare();
await listenerFailureTask.start();
assert.equal(listenerFailureTask.status, "completed");
assert.equal(listenerFailureTask.phase, "completed");
assert.ok(listenerFailureNotifications >= 3);

const preparedTask = new FullTranslationTask([], {
  ...translationConfig,
  contextEnabled: false,
  autoDocumentGlossary: false,
});
preparedTask.status = "ready";
preparedTask.stats.total = 1;
preparedTask.documents = [
  {
    title: "Document",
    analysis: null,
    attachment: { key: "DOCUMENT" },
    parse: { sourceHash: "" },
    cache: { analyses: {}, glossary: { manual: [], ai: [] } },
  },
];
await preparedTask.prepare();
assert.equal(preparedTask.status, "ready");
assert.match(preparedTask.activity, /点击“开始”翻译/);

const csvGlossary = glossarySandbox.parseGlossaryText(
  'source,target,targetLanguage,note,enabled\nmodel,模型,简体中文,"line 1\nline 2",false\n',
  "terms.csv",
);
assert.equal(csvGlossary[0].note, "line 1\nline 2");
assert.equal(glossarySandbox.normalizeGlossaryEntries(csvGlossary)[0].enabled, false);
assert.equal(glossarySandbox.xmlSafeText(`valid\u0000text\ud800`), "valid\ufffdtext\ufffd");
assert.equal(
  glossarySandbox.editableGlossaryEntries({
    glossary: {
      ai: [{ source: "model", target: "AI 模型", origin: "document-ai" }],
      manual: [{ source: "model", target: "人工模型", origin: "document-manual" }],
    },
  })[0].target,
  "人工模型",
);
const tsvExport = glossarySandbox.serializeGlossaryEntries(
  [{ source: "model", target: "模型", enabled: true, origin: "document-ai" }],
  "terms.tsv",
);
assert.match(tsvExport, /^source\ttarget\ttargetLanguage\tnote\tenabled/m);
assert.doesNotMatch(tsvExport, /origin/);
const jsonExport = glossarySandbox.serializeGlossaryEntries(
  [{ source: "model", target: "模型", enabled: true, origin: "document-ai" }],
  "terms.json",
);
assert.deepEqual(Object.keys(JSON.parse(jsonExport)[0]), [
  "source",
  "target",
  "targetLanguage",
  "note",
  "enabled",
]);

const multipart = createMultipartBody(
  [["return_md", "true"]],
  [
    {
      name: "files",
      fileName: "demo.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    },
  ],
);
const multipartText = new TextDecoder().decode(multipart.body);
assert.match(multipart.contentType, /^multipart\/form-data; boundary=----/);
assert.match(multipartText, /name="files"; filename="demo\.pdf"/);
assert.match(multipartText, /Content-Type: application\/pdf/);
assert.match(multipartText, /%PDF\r\n------/);
assert.match(multipartText, /name="return_md"\r\n\r\ntrue/);

console.log("Markdown normalization tests passed.");
