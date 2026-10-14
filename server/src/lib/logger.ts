import { pino } from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config.logLevel,
  // Never let credentials or session tokens reach the logs.
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]', "*.password"],
    censor: "[redacted]",
  },
  ...(config.env === "development" && {
    transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
  }),
});
