/** @module types */

export type LoginResult = {
  userID: number;
  token: string;
  username?: string;
  userFirstName?: string;
  userLastName?: string;
} | null;

export interface UserState {
  loginResult: LoginResult;
  userPreferences: Record<string, unknown>;
}

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  autoHideDuration?: number;
}

export interface ModalState {
  [modalId: string]: boolean;
}
