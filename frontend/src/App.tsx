/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import { Navbar, SnackbarProvider } from "./common";
import ModalProvider from "./ModalProvider";
import LandingPage from "./pages/LandingPage";
import SignIn from "./pages/Auth/SignIn";
import SignUp from "./pages/Auth/SignUp";
import SnapPage from "./pages/SnapPage";
import CollectionPage from "./pages/CollectionPage";
import CollectionItemPage from "./pages/CollectionItemPage";
import "./App.css";
import { addLoginAuthentication, logout } from "./redux/actions/userActions";

const ProtectedRoute = ({ isLoggedIn, children }: any) => {
  if (!isLoggedIn) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

export default function App() {
  const dispatch = useDispatch<any>();
  const loginResult = useSelector((state: any) => state.userState.loginResult);
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(loginResult));
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    // If state changes, keep local login boolean in sync
    setIsLoggedIn(Boolean(loginResult));
  }, [loginResult]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        dispatch(addLoginAuthentication(parsed));
        setIsLoggedIn(true);
      } catch (error) {
        console.error("Error parsing user from localStorage", error);
        localStorage.removeItem("user");
      }
    }
  }, [dispatch]);

  const handleLogout = () => {
    setIsLoggingOut(true);
    dispatch(logout());
    localStorage.removeItem("user");

    setTimeout(() => {
      window.location.href = "/signin";
      setIsLoggedIn(false);
    }, 50);
  };

  if (isLoggingOut) {
    return (
      <div className="logging-out-container">
        <div className="logging-out-message">Logging out…</div>
      </div>
    );
  }

  const MainLayout = ({ children }: any) => {
    const location = useLocation();
    const isLandingPage = location.pathname === "/";

    return (
      <div>
        {!isLandingPage && <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} />}
        {children}
      </div>
    );
  };

  return (
    <Router>
      <ModalProvider />
      <SnackbarProvider />
      <MainLayout>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route
              path="/snap"
              element={
                <ProtectedRoute isLoggedIn={isLoggedIn}>
                  <SnapPage />
                </ProtectedRoute>
              }
            />
            {/* TODO: Re-enable ProtectedRoute when backend is ready */}
            <Route path="/collection" element={<CollectionPage />} />
            <Route path="/collection/item/:id" element={<CollectionItemPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </MainLayout>
    </Router>
  );
}
