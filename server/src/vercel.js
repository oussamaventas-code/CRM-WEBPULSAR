import { assertRuntimeConfig } from './config.js';
import { createApp } from './app.js';

assertRuntimeConfig();

// Vercel invokes this Express app as a function; it must not open a port or
// start the long-running local scheduler from src/index.js.
export default createApp();
