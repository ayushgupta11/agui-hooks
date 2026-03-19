// Polyfills for jsdom test environment
const { TextEncoder, TextDecoder } = require('util');
Object.assign(global, { TextEncoder, TextDecoder });

// ReadableStream polyfill (jsdom doesn't include it)
const { ReadableStream } = require('stream/web');
Object.assign(global, { ReadableStream });
