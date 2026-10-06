#!/usr/bin/env node
/**
 * MCP stdio entry point. Reads newline-delimited JSON-RPC from stdin and writes
 * responses to stdout. Nothing else is ever written to stdout.
 */

import { handleStdio } from './server.js'

await handleStdio()
