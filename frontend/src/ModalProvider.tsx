/** @module ModalProvider */

import React, { useState } from "react";
import { useAppDispatch } from "./redux/hooks";
import { toggleModal } from "./redux/actions/modalActions";

import AddItemModal from "./modals/AddItemModal";
import AppraisalModal from "./modals/AppraisalModal";

type AppraisalData = {
  item_id?: number;
  image_url?: string;
  preview?: string;
  condition?: string;
  item?: { name?: string; description?: string };
  appraisal?: Record<string, unknown>;
};

const ModalProvider: React.FC = () => {
  const dispatch = useAppDispatch();
  const [appraisalData, setAppraisalData] = useState<AppraisalData | null>(null);

  const handleClose = (modal_id: string) => {
    dispatch(toggleModal(modal_id));
  };

  const handleAppraisalReady = (data: AppraisalData) => {
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
