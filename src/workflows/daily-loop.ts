import { dataDir } from '../config/paths.js';
/** Scheduled execution is explicit: an empty job store performs no department work. */
export async function runDueJobs(storageDir = dataDir()) {
  const { DepartmentJobs } = await import('../departments/jobs.js');
  const jobs = new DepartmentJobs(`${storageDir}/jobs`);
  try {
    const results = await jobs.runDue({ storageDir, mode: process.env.MARKETING_MODE === 'simulation' ? 'simulation' : 'live' });
    return { timestamp: new Date().toISOString(), status: results.some(r => r.status !== 'COMPLETED') ? 'NEEDS_ATTENTION' : 'COMPLETED',
      results, summary: `Executed ${results.length} explicitly configured due department jobs.` };
  } finally { jobs.close(); }
}
