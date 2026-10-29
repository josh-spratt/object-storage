import express, { type ErrorRequestHandler } from "express";
import { config } from "./config.ts";
import { explorerRouter } from "./explorer.ts";
import { HttpError, router } from "./routes.ts";

const app = express();

// Only small JSON bodies. Files go straight to object storage, not through here.
app.use(express.json({ limit: "10kb" }));
app.use("/api", router);
if (config.enableExplorer) {
  app.use("/api/explorer", explorerRouter);
  console.log("Explorer enabled: raw DB and bucket contents are exposed at /api/explorer");
}
app.use(express.static(new URL("../public", import.meta.url).pathname));

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Listening on http://localhost:${config.port}`);
});
