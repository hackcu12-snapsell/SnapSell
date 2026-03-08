/** @module LandingPage */

import { useNavigate } from "react-router-dom";

import { useAppSelector } from "../redux/hooks";

import "../App.css";

const LandingPage = () => {
  const navigate = useNavigate();
  const loginResult = useAppSelector(state => state.userState.loginResult);
  const isLoggedIn = Boolean(loginResult);

  const handlePrimary = () => {
    if (isLoggedIn) {
      navigate("/snap");
    } else {
      navigate("/signin");
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-right">
          <div className="landing-card">
            <h2>Snap & Sell</h2>
            <p>Upload a photo and list it on eBay in minutes.</p>
          </div>
          <div className="landing-card">
            <h2>Instant Appraisals</h2>
            <p>Quickly determine the worth of your item using state of the art agentic workflows.</p>
          </div>
          <div className="landing-card">
            <h2> Manage Listings</h2>
            <p>Keep track of your listings and get actionable insights.</p>
          </div>
      </div>
      <div className="landing-left">
        <h1 className="landing-title">SnapSell</h1>
        <button className="btn-primary landing-cta" onClick={handlePrimary}>
          Get Started
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
