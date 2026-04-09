import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middlewares/errorHandler";
import { analyzeRouter } from "./routes/analyze";
import { analysisHistoryRouter } from "./routes/analysisHistory";
import { analysisTrendsRouter } from "./routes/analysisTrends";

export const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(analyzeRouter);
app.use(analysisTrendsRouter);
app.use(analysisHistoryRouter);

app.use(errorHandler);
