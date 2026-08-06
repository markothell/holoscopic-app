const { withLock } = require('../utils/jobs');
const { runSweeps } = require('../utils/sweeps');
const { sweepCircles } = require('../utils/circles');

// Periodic settlement, replacing sweep-on-read.
//
// Interval rather than cron because the work is idempotent and cheap: a tick
// that finds nothing costs one indexed query per active instance.
const SWEEP_INTERVAL_MS = 60_000;
// Lease slightly under the interval, so a process that dies mid-sweep frees
// the lock before the next tick rather than blocking one.
const SWEEP_LEASE_MS = 55_000;

// Circle round advancement (apps/threshold/PLAN.md §3.5).
//
// This one is NOT an optimization of sweep-on-read, it is the primary path.
// Circles are asynchronous by design — nobody has the page open, and the phase
// transition is what generates the email that brings people back. A circle
// waiting to be read would sit dead forever.
//
// Its own lease, separate from 'sweeps', so the two cannot block each other:
// they run at the same cadence and a long settle should not cost a circle a
// full interval.
const CIRCLE_INTERVAL_MS = 60_000;
const CIRCLE_LEASE_MS = 55_000;

let timer = null;
let circleTimer = null;

/**
 * @param {object} deps
 * @param {function} deps.closeAndSettle  from routes/activities.js — injected
 *   so utils/ never imports routes/.
 */
function startJobs(deps = {}) {
  if (timer) return;

  // RUN_JOBS=0 disables the runner for a process, which is how a dedicated
  // worker would become the sole sweeper later without code changes.
  if (process.env.RUN_JOBS === '0') {
    console.log('⏭️  Background jobs disabled (RUN_JOBS=0)');
    return;
  }

  const tick = async () => {
    try {
      await withLock('sweeps', SWEEP_LEASE_MS, () => runSweeps(deps));
    } catch (e) {
      console.error('[jobs] sweep tick failed:', e.message);
    }
  };

  const circleTick = async () => {
    try {
      await withLock('circles', CIRCLE_LEASE_MS, () => sweepCircles());
    } catch (e) {
      console.error('[jobs] circle tick failed:', e.message);
    }
  };

  timer = setInterval(tick, SWEEP_INTERVAL_MS);
  circleTimer = setInterval(circleTick, CIRCLE_INTERVAL_MS);
  // Don't hold the event loop open on shutdown.
  if (timer.unref) timer.unref();
  if (circleTimer.unref) circleTimer.unref();

  // Run one immediately so a restart settles anything that came due while the
  // process was down, rather than waiting a full interval.
  tick();
  circleTick();

  console.log(`⏱️  Background sweeps every ${SWEEP_INTERVAL_MS / 1000}s`);
  console.log(`⏱️  Circle rounds every ${CIRCLE_INTERVAL_MS / 1000}s`);
}

function stopJobs() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (circleTimer) {
    clearInterval(circleTimer);
    circleTimer = null;
  }
}

module.exports = { startJobs, stopJobs };
