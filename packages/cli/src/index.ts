#!/usr/bin/env node
/**
 * @browser-ai/cli — Command-line tools for browser-ai.
 * V1.0 CDC v2026.8 §16.4
 */

import { Command } from 'commander';
import { ejectWorker } from './commands/eject-worker.js';

const program = new Command();

program
  .name('browser-ai')
  .description('CLI tools for browser-ai')
  .version('1.0.0');

program
  .command('eject-worker')
  .description('Eject worker files to your project for CSP compliance (CDC v2026.8 §16.4)')
  .option('-o, --output <dir>', 'Output directory', 'public/browser-ai')
  .option('-f, --force', 'Overwrite existing files', false)
  .option('--provider <provider>', 'Provider to eject (webllm, wasm, all)', 'all')
  .action(async (options) => {
    await ejectWorker(options);
  });

program.parse();
