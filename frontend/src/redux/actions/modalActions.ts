/** @module modalActions */

import { TOGGLE_MODAL } from "../reducers/modalReducer";

export interface ToggleModalAction {
  type: typeof TOGGLE_MODAL;
  payload: {
    modal_id: string;
  };
  [key: string]: unknown;
}

/**
 * @function toggleModal
 * @description Toggles the modal state for a specific modal_id
 */
export const toggleModal = (modal_id: string): ToggleModalAction => ({
  type: TOGGLE_MODAL,
  payload: { modal_id }
});
