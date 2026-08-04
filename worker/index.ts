/**
 * Standalone Agenda worker — deploy this on Render (or any persistent Node server).
 *
 * This process:
 *   1. Connects to MongoDB (same DB as the Next.js app).
 *   2. Registers all job handlers.
 *   3. Starts Agenda so it continuously polls for due jobs and executes them.
 *
 * Job handlers will be added here as you build them out.
 * For now the worker starts and registers placeholder handlers so Agenda
 * doesn't throw "undefined handler" errors for jobs already in the DB.
 */

import 'dotenv/config';
import agenda from './lib/agenda';

// ─── Register job handlers ────────────────────────────────────────────────────
// Each agenda.define() call tells Agenda what to do when a job of that name
// fires. You will fill in the actual email-sending logic later.

agenda.define('send_first_email', async (job) => {
  const { leadId, userId, stepNumber } = job.attrs.data;
  console.log(`[worker] send_first_email | leadId=${leadId} userId=${userId} step=${stepNumber}`);
  // TODO: implement email sending logic here
});

// Handles all followup steps (send_followup_2, send_followup_3, etc.)
// Agenda matches job names exactly, so we register a handler per possible step.
// In practice outreach sequences rarely exceed 10 steps.
for (let step = 2; step <= 10; step++) {
  agenda.define(`send_followup_${step}`, async (job) => {
    const { leadId, userId, stepNumber } = job.attrs.data;
    console.log(`[worker] send_followup_${step} | leadId=${leadId} userId=${userId} step=${stepNumber}`);
    // TODO: implement followup email sending logic here
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  console.log(`[worker] ${signal} received — stopping Agenda gracefully`);
  await agenda.stop();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await agenda.start();
    console.log('[worker] Agenda started — polling for due jobs every 30 seconds');
  } catch (err) {
    console.error('[worker] Failed to start Agenda:', err);
    process.exit(1);
  }
})();
