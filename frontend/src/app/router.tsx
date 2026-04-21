import { createBrowserRouter } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import HistoryPage from "../pages/HistoryPage";
import HistoryDetailPage from "../pages/HistoryDetailPage";
import TrendsPage from "../pages/TrendsPage";
import AnalyzePage from "../pages/AnalyzePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <AnalyzePage />,
      },
      {
        path: "history",
        element: <HistoryPage />,
      },
      {
        path: "history/:id",
        element: <HistoryDetailPage />,
      },
      {
        path: "trends",
        element: <TrendsPage />,
      },
    ],
  },
]);
