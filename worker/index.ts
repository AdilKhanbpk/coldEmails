/**
 * Standalone Agenda worker — deploy this on Render.
 *
 * What this process does:
 *   1. Connects to the same MongoDB as the Next.js app.
 *   2. Registers job handlers for send_first_email and send_followup_N.
 *   3. Starts Agenda — it polls MongoDB every 30s and fires due jobs.
 *
 * Job creation happens on the Next.js side (lib/createLeadJobs.ts).
 * This worker only runs them.
 */

import agenda from './lib/agenda';
import { handleSendFirstEmail, handleSendFollowup } from './lib/emailHandler';

// ─── Job handlers ─────────────────────────────────────────────────────────────

/**
 * send_first_email
 *
 * Fired when it's time to send the very first email to a lead.
 * This handler also generates ALL followup email content via AI at once
 * and stores it in the followup job documents so they don't need AI later.
 */
agenda.define('send_first_email', { concurrency: 3 }, async (job:any) => {
  try {
    await handleSendFirstEmail(job, agenda);
  } catch (err) {
    console.error('[worker] Unhandled error in send_first_email:', err);
    throw err; // Let Agenda mark the job as failed
  }
});

/**
 * send_followup_2 through send_followup_10
 *
 * Fired for each followup step. Email content was pre-generated and stored
 * in job.attrs.data.emailContent by the send_first_email handler.
 */
for (let step = 2; step <= 10; step++) {
  agenda.define(`send_followup_${step}`, { concurrency: 3 }, async (job:any) => {
    try {
      await handleSendFollowup(job);
    } catch (err) {
      console.error(`[worker] Unhandled error in send_followup_${step}:`, err);
      throw err;
    }
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function gracefulShutdown(signal: string) {
  console.log(`[worker] ${signal} received — stopping Agenda gracefully`);
  await agenda.stop();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

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
