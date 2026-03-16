import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middlewares/errorHandler";
import { insightsRouter } from "./routes/insights";
import { ingestRouter } from "./routes/ingest";
import { normalizeRouter } from "./routes/normalize";
import { insightsV1Router } from "./routes/insightsV1";
import { insightsV2Router } from "./routes/insightsV2";
import { insightsV3Router } from "./routes/insightsV3";
import { analyzeRouter } from "./routes/analyze";

export const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(insightsRouter);
app.use(ingestRouter);
app.use(normalizeRouter);
// app.use(insightsV1Router);
// app.use(insightsV2Router);
app.use(insightsV3Router);
app.use(analyzeRouter);

app.use(errorHandler);
