/** @module SignUp */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

import { signup, addLoginAuthentication } from "../../redux/actions/userActions";
import { addSnackbar } from "../../redux/actions/snackbarActions";
import { useAppDispatch } from "../../redux/hooks";

import "../../App.css";

type AuthResponse = {
  success?: boolean;
  error?: string;
};

const SignUp = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = (await dispatch(signup({ email, password }))) as unknown;
      if (typeof response === "object" && response !== null && "success" in response) {
        const res = response as AuthResponse;
        if (res.success) {
          navigate("/snap");
          return;
        }
      }

      // Fallback for demo mode (no backend)
      const localUser = { email, name: email.split("@")[0] };
      localStorage.setItem("user", JSON.stringify(localUser));
      dispatch(addLoginAuthentication(localUser));
      dispatch(
        addSnackbar({
          message: "Signed up (local demo mode)",
          severity: "success"
        })
      );
      navigate("/snap");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign up";
      dispatch(
        addSnackbar({
          message,
          severity: "error"
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Create an account</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </label>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default SignUp;
