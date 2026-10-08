const { deserialize, serialize } = require("node:v8");

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

Element.prototype.scrollIntoView = jest.fn();

// jsdom has no TextEncoder/TextDecoder; the markdown preview decodes attachment bytes with them.
const { TextDecoder, TextEncoder } = require("node:util");
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;
