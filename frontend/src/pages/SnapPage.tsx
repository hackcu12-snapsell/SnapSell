import { useDispatch } from "react-redux";
import { toggleModal } from "../redux/actions/modalActions";
import { Button } from "../common";

const SnapPage = () => {
  const dispatch = useDispatch();

  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <h2>My Items</h2>
      <Button variant="contained" onClick={() => dispatch(toggleModal("addItemModal"))}>
        + Add Item
      </Button>
    </div>
  );
};

export default SnapPage;
