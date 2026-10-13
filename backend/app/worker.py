"""The worker: runs the timed jobs (services/jobs.py) on a schedule.

Run it from the backend folder, in its own terminal, next to uvicorn:

    python -m app.worker              every 5 minutes, until you press Ctrl+C
    python -m app.worker --every 60   every 60 seconds (handy while testing)
    python -m app.worker --once       run every job once, then stop

--once is what a server scheduler (e.g. cron, or a cloud "scheduled job")
calls in production (Phase 8). The website works without the worker; only
the reminders, expiry and clean-up wait until it runs.
"""

import argparse
import logging
import time

from app.core.clock import now
from app.core.database import SessionLocal
from app.services.jobs import run_all

log = logging.getLogger("worker")


def run_once() -> dict[str, int]:
    # A fresh database session per run, closed afterwards.
    with SessionLocal() as db:
        done = run_all(db, now())
    worked = {name: count for name, count in done.items() if count}
    log.info("Jobs done: %s", worked or "nothing was due")
    return done


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.worker")
    parser.add_argument("--once", action="store_true", help="run every job once, then stop")
    parser.add_argument("--every", type=int, default=300, help="seconds between runs (default 300)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if args.once:
        run_once()
        return

    log.info("Worker started: running jobs every %s seconds. Press Ctrl+C to stop.", args.every)
    try:
        while True:
            run_once()
            time.sleep(args.every)
    except KeyboardInterrupt:
        log.info("Worker stopped.")


if __name__ == "__main__":
    main()
