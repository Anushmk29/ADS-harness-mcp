#!/usr/bin/env node
import { runDeepSeek } from '../dist/core/deepseek/tool-runner.js';
const prompt = process.argv.slice(2).join(' ');
if (!prompt.trim()) throw new Error('Usage: node --env-file=.env bin/ask.js "your task"');
try { console.log(JSON.stringify(await runDeepSeek(prompt), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
