import db from "../db.server";
import { safeProductionError } from "./production-file-identity";
import { generateAndPersistProductionFile, markProductionFilesFailed } from "./production-file.server";

type AdminGraphql = Parameters<typeof generateAndPersistProductionFile>[0];
type AdminFactory = (shop: string) => Promise<AdminGraphql>;

const POLL_INTERVAL_MS = 5_000;
const STALE_LOCK_MS = 15 * 60 * 1000;

type WorkerState = {
  factory?: AdminFactory;
  running: boolean;
  timer?: NodeJS.Timeout;
};

declare global {
  // eslint-disable-next-line no-var
  var splashProductionWorker: WorkerState | undefined;
}

const state = global.splashProductionWorker ||= { running: false };

function schedule(delay = POLL_INTERVAL_MS) {
  if (!state.factory || state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = undefined;
    void runProductionWorker();
  }, delay);
  state.timer.unref();
}

async function runProductionWorker() {
  if (!state.factory || state.running) return schedule();
  state.running = true;
  try {
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
    const queued = await db.orderDesign.findMany({
      where: {
        OR: [
          { productionFileStatus: "PENDING" },
          { productionFileStatus: "PROCESSING", productionFileLockedAt: { lt: staleBefore } },
          { productionFileStatus: "PROCESSING", productionFileLockedAt: null },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true, shop: true },
    });
    const clients = new Map<string, AdminGraphql>();
    for (const job of queued) {
      try {
        let admin = clients.get(job.shop);
        if (!admin) {
          admin = await state.factory(job.shop);
          clients.set(job.shop, admin);
        }
        await generateAndPersistProductionFile(admin, job.shop, job.id);
      } catch (error) {
        await markProductionFilesFailed(job.shop, [job.id], error instanceof Error ? error.message : "Production worker failed.");
      }
    }
  } catch (error) {
    console.error("Production worker cycle failed.", safeProductionError(error));
  } finally {
    state.running = false;
    schedule();
  }
}

export function startProductionWorker(factory: AdminFactory) {
  state.factory = factory;
  schedule(1_000);
}

export function queueProductionWork() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }
  schedule(0);
}
