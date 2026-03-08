/** @module modalReducer */

import type { ModalState } from "../types";
import type { AnyAction } from "redux";

export const TOGGLE_MODAL = "TOGGLE_MODAL";

export const defaultState: ModalState = {};

const modalReducer = (state: ModalState = defaultState, action: AnyAction): ModalState => {
  switch (action.type) {
    case TOGGLE_MODAL: {
      const { modal_id } = action.payload;
      return {
        ...state,
        [modal_id]: !state[modal_id]
      };
    }

    default:
      return state;
  }
};

export default modalReducer;
