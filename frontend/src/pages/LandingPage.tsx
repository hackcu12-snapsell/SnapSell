/** @module LandingPage */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useAppSelector } from "../redux/hooks";

import "../App.css";

const LandingPage = () => {
  const navigate = useNavigate();
  const loginResult = useAppSelector(state => state.userState.loginResult);
  const isLoggedIn = Boolean(loginResult);

  const buttonLabel = useMemo(() => {
    if (isLoggedIn) return "Go to Snap Sell";
    return "Get Started";
  }, [isLoggedIn]);

  const handlePrimary = () => {
    if (isLoggedIn) {
      navigate("/snap");
    } else {
      navigate("/signin");
    }
  };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <h1>SnapSell</h1>
        <p className="subtitle">Snap a photo of an item and get a quick appraisal.</p>
      </header>

      <main className="landing-content">
        <div className="landing-cards">
          <div className="landing-card">
            <h2>Fast Appraisals</h2>
            <p>Upload a photo and get an instant estimate based on condition, brand, and era.</p>
          </div>
          <div className="landing-card">
            <h2>Save Favorites</h2>
            <p>Keep a history of items you’ve reviewed and revisit them later.</p>
          </div>
          <div className="landing-card">
            <h2>Secure & Private</h2>
            <p>We never share your photos without your permission.</p>
          </div>
        </div>
        <button className="btn-primary" onClick={handlePrimary}>
          {buttonLabel}
        </button>
      </main>
    </div>
  );
};

export default LandingPage;
