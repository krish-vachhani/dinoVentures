import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

if (config.isProduction && config.payments.simulationEnabled) {
  logger.warn("MOCK_PAYMENT_SIMULATION is enabled in production: users can settle payments without a real gateway");
}

const server = createApp().listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.env, paymentSimulation: config.payments.simulationEnabled },
    "Coin Vault API listening",
  );
});

/**
 * Stops accepting connections, lets in-flight requests (and their
 * transactions) finish, then closes the database pool.
 */
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (error) => {
    await prisma.$disconnect();
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection");
});
