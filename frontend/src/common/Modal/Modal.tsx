/** @module Modal.tsx */

import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Divider, Button } from "@mui/material";
import { toggleModal } from "../../redux/actions/modalActions";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";

export type ModalButtonVariant = "text" | "outlined" | "contained";

export interface ModalFooterButton {
  text: string;
  onClick?: () => void;
  variant?: ModalButtonVariant;
  disabled?: boolean;
  primary?: boolean;
  secondary?: boolean;
}

export interface ModalProps {
  modal_id: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  footerButtons?: ModalFooterButton[];
  style?: React.CSSProperties;
}

const Modal: React.FC<ModalProps> = ({ modal_id, title, children, footerButtons, style }) => {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(state => Boolean(state.modalState?.[modal_id]));

  const handleClose = () => {
    dispatch(toggleModal(modal_id));
  };

  return (
    <Dialog
      open={Boolean(isOpen)}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: {
          ...style,
          width: style?.width || "100%",
          maxWidth: style?.maxWidth || "600px",
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
          background: "#1c1c1e",
          color: "#fff"
        }
      }}
    >
      <DialogTitle sx={{ paddingBottom: 0, color: "#fff" }}>
        {title}
        <Divider sx={{ marginTop: 1, borderColor: "rgba(255,255,255,0.12)" }} />
      </DialogTitle>

      <DialogContent
        sx={{
          flex: "1 1 auto",
          overflowY: "auto"
        }}
      >
        {children}
      </DialogContent>

      <Divider sx={{ marginBottom: 1, borderColor: "rgba(255,255,255,0.12)" }} />

      <DialogActions
        sx={{
          justifyContent: "flex-end",
          flexShrink: 0,
          padding: "12px 16px",
          paddingTop: "4px"
        }}
      >
        {(footerButtons ?? []).map(
          ({ text, onClick, variant, disabled, primary, secondary }, index) => (
            <Button
              key={index}
              variant={variant}
              onClick={onClick}
              disabled={disabled}
              sx={{
                marginLeft: 1,
                ...(primary && {
                  backgroundColor: "#f0f0f0",
                  border: "none",
                  color: "#111",
                  fontWeight: 700,
                  padding: "8px 24px",
                  "&:hover": { backgroundColor: "#fff" },
                  "&.Mui-disabled": {
                    backgroundColor: "rgba(255,255,255,0.12)",
                    color: "#555"
                  }
                }),
                ...(secondary && {
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "#bbb",
                  "&:hover": {
                    borderColor: "rgba(255,255,255,0.5)",
                    color: "#fff"
                  }
                }),
                ...(text === "Cancel" && {
                  backgroundColor: "#db584f",
                  border: "none",
                  color: "white",
                  "&:hover": { backgroundColor: "darkred" }
                }),
                ...(text === "Save" && {
                  backgroundColor: "#3498db",
                  border: "none",
                  color: "white",
                  "&:hover": { backgroundColor: "#2980b9" }
                })
              }}
            >
              {text}
            </Button>
          )
        )}
      </DialogActions>
    </Dialog>
  );
};

export default Modal;
