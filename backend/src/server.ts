import { env } from "./config";
import { app } from "./app";

app.listen(env.PORT, () => {
  console.log(`Backend running on http://localhost:${env.PORT}`);
});
