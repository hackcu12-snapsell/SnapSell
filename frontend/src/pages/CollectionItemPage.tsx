import { useParams, Link } from "react-router-dom";
import "../App.css";

const CollectionItemPage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="collection-item-page">
      <p className="collection-item-placeholder">Item detail (id: {id})</p>
      <Link to="/collection" className="collection-item-back">
        ← Back to collection
      </Link>
    </div>
  );
};

export default CollectionItemPage;
