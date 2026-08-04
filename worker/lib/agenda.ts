import Agenda from 'agenda';

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is not set');
}

// Single shared Agenda instance — connects to the same MongoDB as the Next.js app.
// Jobs are stored in the "agendaJobs" collection.
const agenda = new Agenda({
  db: {
    address: process.env.MONGODB_URI,
    collection: 'agendaJobs',
  },
  // How often Agenda polls MongoDB for due jobs (when worker is running).
  processEvery: '30 seconds',
  // Max jobs running in parallel inside this worker process.
  maxConcurrency: 5,
  // Lock jobs for up to 10 minutes before considering them stale.
  defaultLockLifetime: 10 * 60 * 1000,
});

export default agenda;
