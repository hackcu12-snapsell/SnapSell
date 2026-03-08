/** @module configureStore */

import { configureStore, type Middleware } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";

import userState from "./reducers/userReducer";
import snackbarState from "./reducers/snackbarReducer";
import modalState from "./reducers/modalReducer";

const logger = createLogger({ collapsed: true, diff: true }) as Middleware;

export const store = configureStore({
  reducer: {
    userState,
    snackbarState,
    modalState
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(logger)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
