/** @module Navbar */

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { toggleModal } from "../../redux/actions/modalActions";
import "./Navbar.css";

export interface NavbarProps {
  isLoggedIn: boolean;
  onLogout?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ isLoggedIn, onLogout }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    // Get user info from localStorage if logged in
    if (isLoggedIn) {
      try {
        const userInfo = JSON.parse(localStorage.getItem("user") ?? "");
        if (userInfo && userInfo.name) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setUserName(userInfo.name);
        } else if (userInfo && userInfo.email) {
          // Use email as fallback
          setUserName(userInfo.email.split("@")[0]);
        }
      } catch (error) {
        console.error("Error parsing user info:", error);
      }
    }
  }, [isLoggedIn]);

  const handleLogout = () => {
    if (onLogout) {
      // Set local state immediately to prevent flashing content
      setUserName("");
      // Call the parent logout handler which will handle the redirect
      onLogout();
    }
  };
  const handleSignIn = () => {
    navigate("/signin");
  };

  const handleSignUp = () => {
    navigate("/signup");
  };

  const handleAbout = () => {
    dispatch(toggleModal("globalModal"));
  };

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Link to="/">SnapSell</Link>
      </div>
      <div className="navbar-links">
        <button className="nav-link" onClick={handleAbout}>
          About
        </button>
        {isLoggedIn ? (
          <>
            <Link to="/snap">Snap</Link>
            <Link to="/collection">Collection</Link>
            {userName && <span className="user-greeting">Hello, {userName}</span>}
            <button className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <button className="login-button" onClick={handleSignIn}>
              Login
            </button>
            <button className="signup-button" onClick={handleSignUp}>
              Sign Up
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
