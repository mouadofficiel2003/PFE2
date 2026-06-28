import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthLoadingScreen } from "../auth/AuthLoadingScreen";

export default function RootRedirect() {
  const { state } = useAuth();
  if (state.status === "loading") {
    return <AuthLoadingScreen />;
  }
  if (state.status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
}
