/** @module SnackbarProvider.tsx */

import React from "react";
import { Snackbar, Alert } from "@mui/material";
import { removeSnackbar } from "../../redux/actions/snackbarActions";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";

const SnackbarProvider: React.FC = () => {
  const dispatch = useAppDispatch();
  const {
    open,
    message,
    severity,
    autoHideDuration = 6000
  } = useAppSelector(state => state.snackbarState);

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
