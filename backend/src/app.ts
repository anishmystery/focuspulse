import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middlewares/errorHandler";
import { analyzeRouter } from "./routes/analyze";

export const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(analyzeRouter);

app.use(errorHandler);
