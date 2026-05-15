import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(root, "src", "zotero-mark-reader.js"), "utf8");
const sandbox = {
  process: { env: { ZMR_TEST: "1" } },
  TextEncoder,
  Zotero: {
    debug() {},
    logError() {},
    Prefs: { get() {} },
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, {
  filename: "zotero-mark-reader.js",
});

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
} = sandbox.ZoteroMarkReader.__test;

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
