/** @module SignIn */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../../redux/actions/userActions";
import { addSnackbar } from "../../redux/actions/snackbarActions";
import { useAppDispatch } from "../../redux/hooks";
import "../../App.css";

type AuthResponse = {
  success?: boolean;
  error?: string;
};

const SignIn = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await (dispatch(login({ email, password })) as Promise<AuthResponse>);
      if (response?.success) {
        navigate("/snap");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in";
      dispatch(addSnackbar({ message, severity: "error" }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Sign in</h2>
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
              autoComplete="current-password"
            />
          </label>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Sign Up</Link>
        </p>
      </div>
    </div>
  );
};

export default SignIn;
