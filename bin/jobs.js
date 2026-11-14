#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { DepartmentJobs } from '../dist/departments/jobs.js';
const [command = 'list', argument] = process.argv.slice(2);
const jobs = new DepartmentJobs();
try {
  const result = command === 'add' ? jobs.add(JSON.parse(readFileSync(argument, 'utf8')))
    : command === 'run-due' ? await jobs.runDue({ mode: process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live' })
    : command === 'pause' ? jobs.pause(argument) : command === 'resume' || command === 'retry' ? jobs.resume(argument)
    : command === 'list' ? jobs.list() : (() => { throw new Error('Use list, add <file.json>, run-due, pause <id>, resume <id>, retry <id>'); })();
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { jobs.close(); }
