import React from "react";
import { Link } from "react-router-dom";
import "./CollectionCard.css";

const CollectionCard = ({ item, to }) => {
  const cardContent = (
    <>
      <div className="collection-card-image-wrapper">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="collection-card-image" />
        ) : (
          <div className="collection-card-placeholder">No image</div>
        )}
      </div>

      <div className="collection-card-footer">
        <span
          className="collection-card-name"
          title={item.price != null ? `${item.name} • $${item.price.toLocaleString()}` : item.name}
        >
          {item.name}
          {item.price != null && ` • $${item.price.toLocaleString()}`}
        </span>
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="collection-card-link">
        <div className="collection-card">{cardContent}</div>
      </Link>
    );
  }

  return <div className="collection-card">{cardContent}</div>;
};

export default CollectionCard;
