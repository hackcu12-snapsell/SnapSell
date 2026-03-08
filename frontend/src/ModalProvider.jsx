/** @module ModalProvider.jsx */

import React from "react";
import { useDispatch } from "react-redux";
import { toggleModal } from "./redux/actions/modalActions";
import AddItemModal from "./modals/AddItemModal";

const ModalProvider = () => {
  const dispatch = useDispatch();

  const handleClose = modal_id => {
    dispatch(toggleModal(modal_id));
  };

  return (
    <>
      <AddItemModal handleClose={handleClose} />
    </>
  );
};

export default ModalProvider;
