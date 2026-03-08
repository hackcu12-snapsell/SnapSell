/** @module ModalProvider.jsx */

import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { toggleModal } from "./redux/actions/modalActions";
import AddItemModal from "./modals/AddItemModal";
import AppraisalModal from "./modals/AppraisalModal";

const ModalProvider = () => {
  const dispatch = useDispatch();
  const [appraisalData, setAppraisalData] = useState(null);

  const handleClose = modal_id => {
    dispatch(toggleModal(modal_id));
  };

  const handleAppraisalReady = data => {
    setAppraisalData(data);
    dispatch(toggleModal("appraisalModal"));
  };

  return (
    <>
      <AddItemModal handleClose={handleClose} onAppraisalReady={handleAppraisalReady} />
      <AppraisalModal handleClose={handleClose} data={appraisalData} />
    </>
  );
};

export default ModalProvider;
