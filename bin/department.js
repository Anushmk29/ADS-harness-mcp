#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createDepartment } from '../dist/departments/runtime.js';
import { departmentIds } from '../dist/departments/catalog.js';

const [department = 'hq', command = 'capabilities', argument] = process.argv.slice(2);
if (!departmentIds.includes(department)) throw new Error(`Department must be one of: ${departmentIds.join(', ')}`);
const runtime = createDepartment(department, { mode: process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live' });
try {
  let result;
  switch (command) {
    case 'capabilities': result = runtime.listCapabilities(); break;
    case 'tools': result = await runtime.listTools(); break;
    case 'run': {
      if (!argument) throw new Error('Usage: marketing-department <department> run <task.json>');
      result = await runtime.run(JSON.parse(readFileSync(argument, 'utf8'))); break;
    }
    case 'resume': result = await runtime.resume(argument); break;
    case 'approve': result = await runtime.decide(argument, true); break;
    case 'reject': result = await runtime.decide(argument, false); break;
    default: throw new Error('Commands: capabilities, tools, run <task.json>, approve/reject/resume <operationId>');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await runtime.close(); }
