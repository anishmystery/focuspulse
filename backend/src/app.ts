import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middlewares/errorHandler";
import { insightsRouter } from "./routes/insights";
import { ingestRouter } from "./routes/ingest";
import { normalizeRouter } from "./routes/normalize";
import { insightsV1Router } from "./routes/insightsV1";

export const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(insightsRouter);
app.use(ingestRouter);
app.use(normalizeRouter);
app.use(insightsV1Router);

app.use(errorHandler);
