import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { paymentWebhookRouter } from "./modules/payments/payments.routes.js";
import { createTopupsRouter } from "./modules/topups/topups.routes.js";
import { walletRouter } from "./modules/wallet/wallet.routes.js";

export interface AppOptions {
  enablePaymentSimulation?: boolean;
}

export function createApp({ enablePaymentSimulation = config.payments.simulationEnabled }: AppOptions = {}): Express {
  const app = express();

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1); // exactly one reverse proxy (e.g. nginx) in front
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      // Keep request logs to what is useful for debugging; headers stay out.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(cookieParser());

  // Mounted before the JSON parser: the webhook verifies a signature over the raw body.
  app.use("/api/webhooks", paymentWebhookRouter);

  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  });

  // Lets the client know whether to show the mock checkout's outcome buttons.
  app.get("/api/config", (_req, res) => {
    res.json({ paymentSimulationEnabled: enablePaymentSimulation });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", catalogRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/topups", createTopupsRouter({ enablePaymentSimulation }));
  app.use("/api/orders", ordersRouter);
  app.use("/api/inventory", inventoryRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
