/* eslint-disable @typescript-eslint/no-explicit-any */
/** @module SnackbarProvider.tsx */

import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Snackbar, Alert, type AlertColor } from "@mui/material";
import { removeSnackbar } from "../../redux/actions/snackbarActions";

interface SnackbarState {
  open: boolean;
  message: string;
  severity: AlertColor;
  autoHideDuration?: number;
}

const SnackbarProvider: React.FC = () => {
  const dispatch = useDispatch();
  const {
    open,
    message,
    severity,
    autoHideDuration = 6000
  } = useSelector((state: any) => state.snackbarState) as SnackbarState;

  const handleClose = (_event: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === "clickaway") {
      return;
    }
    dispatch(removeSnackbar({}));
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert onClose={handleClose} severity={severity} variant="filled" sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
};

export default SnackbarProvider;
