/** @module ModalProvider.jsx */

import React from "react";
import { useDispatch } from "react-redux";

import Modal from "./common/Modal/Modal";
import { toggleModal } from "./redux/actions/modalActions";

const ModalProvider = () => {
  const dispatch = useDispatch();

  const handleClose = (modal_id) => {
    dispatch(toggleModal(modal_id));
  };

  return (
    <>
      <Modal
        modal_id="globalModal"
        title="Add Item"
        footerButtons={[
          {
            text: "Cancel",
            variant: "contained",
            onClick: () => handleClose("globalModal"),
          },
        ]}
      >
        <p>This is the Add Item modal content.</p>
      </Modal>
    </>
  );
};

export default ModalProvider;
