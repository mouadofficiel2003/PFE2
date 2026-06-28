import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import CandidatsPage from "./pages/CandidatsPage";
import DashboardPage from "./pages/DashboardPage";
import ConcoursPage from "./pages/ConcoursPage";
import ConvocationsPage from "./pages/ConvocationsPage";
import GestionnairesPage from "./pages/GestionnairesPage";
import LieuxPage from "./pages/LieuxPage";
import LoginPage from "./pages/LoginPage";
import RepartitionPage from "./pages/RepartitionPage";
import RootRedirect from "./pages/RootRedirect";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/candidats"
            element={
              <RequireAuth>
                <CandidatsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/concours"
            element={
              <RequireAuth>
                <ConcoursPage />
              </RequireAuth>
            }
          />
          <Route
            path="/lieux"
            element={
              <RequireAuth>
                <LieuxPage />
              </RequireAuth>
            }
          />
          <Route
            path="/repartition"
            element={
              <RequireAuth>
                <RepartitionPage />
              </RequireAuth>
            }
          />
          <Route
            path="/convocations"
            element={
              <RequireAuth>
                <ConvocationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/gestionnaires"
            element={
              <RequireAuth>
                <GestionnairesPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
