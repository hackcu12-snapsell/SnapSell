/** @module CollectionItemPage */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useSelector } from "react-redux";

import { API_URL } from "../data/constants";
import { basicAPI } from "../utils/utilsThisApp";

import "../App.css";

type ItemStatus = "inventory" | "listed" | "sold" | "appraised";

type Listing = {
  url: string;
  condition: string;
  price: number | null;
};

type Item = {
  id: number;
  name: string;
  status: ItemStatus;
  imageUrl: string;
  price?: number | null;
  createdAt?: string | null;
  description?: string | null;
  brand?: string | null;
  year?: number | null;
  condition?: string | null;
  meanValue?: number | null;
  listings?: Listing[];
};

type RootState = {
  userState: {
    loginResult: {
      userID: number;
      token: string;
    } | null;
  };
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  appraised: "Appraised",
  inventory: "Inventory",
  listed: "Listed",
  sold: "Sold"
};

const CollectionItemPage = () => {
  const { id } = useParams<{ id: string }>();
  const loginResult = useSelector((state: RootState) => state.userState.loginResult);
  const token = loginResult?.token;

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const itemId = id ? parseInt(id, 10) : NaN;

    if (!id || Number.isNaN(itemId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const fetchItem = async () => {
      if (!token) {
        setLoading(false);
        setNotFound(true);
        return;
      }

      setLoading(true);
      setNotFound(false);

      try {
        const response: any = await basicAPI(`${API_URL}/items`, "getUserItems", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!isMounted) return;

        const rawItems: any[] = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : [];
        const found = rawItems.find((raw: any) => Number(raw.id) === itemId);

        if (!found) {
          setNotFound(true);
          setItem(null);
          return;
        }

        const raw = found as Record<string, unknown>;
        const desc = raw.description;
        const description = typeof desc === "string" ? desc : null;
        const meanVal = raw.mean_value != null ? Number(raw.mean_value) : (raw.meanValue != null ? Number(raw.meanValue) : null);
        const rawListings = Array.isArray(raw.listings) ? raw.listings : [];
        const listings: Listing[] = rawListings.map((r: any) => ({
          url: r?.url ?? "",
          condition: r?.condition ?? "",
          price: r?.price != null ? Number(r.price) : null
        }));
        setItem({
          id: found.id,
          name: found.name ?? "Untitled item",
          status: (found.status ?? "inventory") as ItemStatus,
          imageUrl: found.imageUrl ?? found.image_url ?? found.image ?? "",
          price: found.price ?? found.estimated_price ?? null,
          createdAt: found.created_at ?? found.createdAt ?? null,
          description,
          brand: found.brand ?? null,
          year: found.year != null ? Number(found.year) : null,
          condition: found.condition ?? null,
          meanValue: meanVal,
          listings
        });
      } catch {
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchItem();
    return () => {
      isMounted = false;
    };
  }, [id, token]);

  const handleAddToCollection = () => {
    // TODO: wire to add-to-collection flow
  };

  const handleCreateListing = () => {
    // TODO: wire to create-listing flow
  };

  const handleViewListing = () => {
    // TODO: wire to view listing (e.g. open eBay URL or modal)
  };

  if (loading) {
    return (
      <div className="collection-item-page">
        <p className="collection-item-loading">Loading item…</p>
        <Link to="/collection" className="collection-item-back">
          ← Back to collection
        </Link>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="collection-item-page">
        <p className="collection-item-error">Item not found.</p>
        <Link to="/collection" className="collection-item-back">
          ← Back to collection
        </Link>
      </div>
    );
  }

  const statusLabel = STATUS_LABEL[item.status];

  return (
    <div className="collection-item-page">
      <Link to="/collection" className="collection-item-back">
        ← Back to collection
      </Link>
      <div className="collection-item-header">
        <h1 className="collection-item-title">
          {item.name} <span className="collection-item-status">({statusLabel})</span>
        </h1>
        <div className="collection-item-actions">
          {item.status === "appraised" && (
            <button type="button" className="collection-item-btn" onClick={handleAddToCollection}>
              Add to Collection
            </button>
          )}
          {item.status === "inventory" && (
            <button type="button" className="collection-item-btn" onClick={handleCreateListing}>
              Create Listing
            </button>
          )}
          {(item.status === "listed" || item.status === "sold") && (
            <button type="button" className="collection-item-btn" onClick={handleViewListing}>
              View Listing
            </button>
          )}
        </div>
      </div>

      <div className="collection-item-detail">
        <div className="collection-item-image-column">
          <div className="collection-item-image-wrap">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="collection-item-image" />
            ) : (
              <div className="collection-item-image-placeholder">No image</div>
            )}
          </div>
        </div>
        <dl className="collection-item-meta">
          <dt>Name</dt>
          <dd>{item.name}</dd>
          <dt>Description</dt>
          <dd>{item.description && String(item.description).trim() ? item.description : "—"}</dd>
          <dt>Condition</dt>
          <dd>{item.condition ?? "—"}</dd>
          <dt>Brand</dt>
          <dd>{item.brand ?? "—"}</dd>
          <dt>Age</dt>
          <dd>{item.year != null ? item.year : "—"}</dd>
        </dl>
        <div className="collection-item-appraisal">
          <span className="collection-item-appraisal-label">Estimated Value:</span>
          <span className="collection-item-appraisal-value">
            {item.meanValue != null && !Number.isNaN(item.meanValue) ? `$${Number(item.meanValue).toFixed(2)}` : "—"}
          </span>
        </div>
      </div>

      <div className="collection-item-listings-card">
        <h3 className="collection-item-listings-title">Listing references</h3>
        {item.listings && item.listings.length > 0 ? (
          <table className="collection-item-listings-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Condition</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {item.listings.map((listing, idx) => (
                <tr key={idx}>
                  <td>
                    <a href={listing.url} target="_blank" rel="noopener noreferrer" className="collection-item-listings-link">
                      {listing.url}
                    </a>
                  </td>
                  <td className="collection-item-listings-cell">{listing.condition || "—"}</td>
                  <td className="collection-item-listings-cell">{listing.price != null ? `$${Number(listing.price).toFixed(2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="collection-item-listings-empty">No listing references for this appraisal.</p>
        )}
      </div>
    </div>
  );
};

export default CollectionItemPage;
