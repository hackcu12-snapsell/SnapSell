/** @module CollectionPage */

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";

import { CollectionCard } from "../common";
import { API_URL, getItemImageUrl } from "../data/constants";
import { addSnackbar } from "../redux/actions/snackbarActions";
import { basicAPI } from "../utils/utilsThisApp";

// TODO: is this css import used/needed
import "../App.css";

type ItemStatus = "inventory" | "listed" | "sold" | "appraised";

type Item = {
  id: number;
  name: string;
  status: ItemStatus;
  imageUrl: string;
  price?: number | null;
  listingPrice?: number | null;
  purchasePrice?: number | null;
  postedDate?: string | null;
  lastPriceChangeDate?: string | null;
  createdAt?: string | null;
  condition?: string | null;
};

type SortField = "name" | "price" | "date";

type SortDirection = "asc" | "desc";

type SortState = {
  field: SortField;
  direction: SortDirection;
};

type SectionKey = Exclude<ItemStatus, "appraised">;

const STATUS_SECTIONS: {
  key: SectionKey;
  label: string;
  emptyText: string;
}[] = [
  {
    key: "inventory",
    label: "Inventory",
    emptyText: "You don't have any items in inventory yet."
  },
  {
    key: "listed",
    label: "Listed",
    emptyText: "You don't have any items currently listed."
  },
  {
    key: "sold",
    label: "Sold",
    emptyText: "You haven't sold any items yet."
  }
];

const SORT_FIELDS: SortField[] = ["date", "name", "price"];

const SORT_FIELD_LABEL: Record<SortField, string> = {
  date: "Date",
  name: "Name",
  price: "Price"
};

const DEFAULT_SORT_STATE: SortState = { field: "date", direction: "desc" };

/** Temporary mock data for preview when not logged in / no backend */
const MOCK_ITEMS: Item[] = [
  {
    id: 1,
    name: "Vintage Camera",
    status: "inventory",
    imageUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400",
    price: 125,
    createdAt: "2025-01-01T10:00:00Z"
  },
  {
    id: 2,
    name: "Retro Sneakers",
    status: "inventory",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
    price: 89,
    createdAt: "2025-01-02T10:00:00Z"
  },
  {
    id: 3,
    name: "Record Player",
    status: "listed",
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400",
    price: 220,
    createdAt: "2025-01-03T10:00:00Z"
  },
  {
    id: 4,
    name: "Leather Jacket",
    status: "listed",
    imageUrl: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400",
    price: 175,
    createdAt: "2025-01-04T10:00:00Z"
  },
  {
    id: 5,
    name: "Designer Watch",
    status: "sold",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
    price: 450,
    createdAt: "2025-01-05T10:00:00Z"
  },
  {
    id: 6,
    name: "Vinyl Collection",
    status: "sold",
    imageUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400",
    price: 95,
    createdAt: "2025-01-06T10:00:00Z"
  }
];

const CollectionPage = () => {
  const dispatch = useAppDispatch();
  const loginResult = useAppSelector(state => state.userState.loginResult);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sortState, setSortState] = useState<Record<SectionKey, SortState>>({
    inventory: DEFAULT_SORT_STATE,
    listed: DEFAULT_SORT_STATE,
    sold: DEFAULT_SORT_STATE
  });

  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    inventory: true,
    listed: true,
    sold: true
  });

  const token = loginResult?.token;

  const handleRevisePrice = async (itemId: number, newPrice: number) => {
    if (!token) return;
    try {
      const res = await fetch("/api/revise-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: itemId, new_price: newPrice })
      });
      if (res.ok) {
        setItems(prev =>
          prev.map(item =>
            item.id === itemId
              ? { ...item, listingPrice: newPrice, lastPriceChangeDate: new Date().toISOString() }
              : item
          )
        );
      }
    } catch (err) {
      console.error("[CollectionPage] Revise price failed:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchItems = async () => {
      if (!token) {
        setItems(MOCK_ITEMS);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await basicAPI(`${API_URL}/items`, "getUserItems", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!isMounted) return;

        /** FIX: safe TypeScript narrowing for API response */
        let rawArray: unknown[] = [];

        if (Array.isArray(response)) {
          rawArray = response;
        } else if (response && typeof response === "object" && "items" in response) {
          const maybeItems = (response as Record<string, unknown>).items;
          if (Array.isArray(maybeItems)) rawArray = maybeItems;
        }

        const mapped: Item[] = rawArray.map(rawItem => {
          const raw =
            typeof rawItem === "object" && rawItem !== null
              ? (rawItem as Record<string, unknown>)
              : {};

          return {
            id: typeof raw.id === "number" ? raw.id : 0,
            name: typeof raw.name === "string" ? raw.name : "Untitled item",
            status: (raw.status ?? "inventory") as ItemStatus,
            imageUrl: getItemImageUrl(
              (typeof raw.imageUrl === "string" && raw.imageUrl) ||
                (typeof raw.image_url === "string" && raw.image_url) ||
                (typeof raw.image === "string" && raw.image) ||
                ""
            ),
            price:
              typeof raw.mean_value === "number"
                ? raw.mean_value
                : null,
            createdAt:
              typeof raw.created_at === "string"
                ? raw.created_at
                : typeof raw.createdAt === "string"
                  ? raw.createdAt
                  : null,
            condition: typeof raw.condition === "string" ? raw.condition : null,
            listingPrice: typeof raw.listing_price === "number" ? raw.listing_price : null,
            purchasePrice: typeof raw.purchase_price === "number" ? raw.purchase_price : null,
            postedDate: typeof raw.posted_date === "string" ? raw.posted_date : null,
            lastPriceChangeDate: typeof raw.last_price_change_date === "string" ? raw.last_price_change_date : null
          };
        });

        setItems(mapped);
      } catch (e) {
        if (!isMounted) return;

        const message = e instanceof Error ? e.message : "Failed to load items.";

        setError(message);

        dispatch(
          addSnackbar({
            message,
            severity: "error"
          })
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchItems();

    return () => {
      isMounted = false;
    };
  }, [dispatch, token]);

  const sortedItems = useMemo(() => {
    const base: Record<SectionKey, Item[]> = {
      inventory: [],
      listed: [],
      sold: []
    };

    items.forEach(item => {
      if (item.status === "inventory" || item.status === "listed" || item.status === "sold") {
        base[item.status].push(item);
      }
    });

    const sortList = (list: Item[], state: SortState) => {
      const arr = [...list];
      const factor = state.direction === "asc" ? 1 : -1;

      if (state.field === "name") {
        arr.sort((a, b) => factor * a.name.localeCompare(b.name));
      } else if (state.field === "price") {
        arr.sort((a, b) => factor * ((a.price ?? 0) - (b.price ?? 0)));
      } else {
        arr.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
          return factor * (aDate - bDate);
        });
      }

      return arr;
    };

    return {
      inventory: sortList(base.inventory, sortState.inventory),
      listed: sortList(base.listed, sortState.listed),
      sold: sortList(base.sold, sortState.sold)
    };
  }, [items, sortState]);

  const toggleSection = (key: SectionKey) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const cycleSortField = (key: SectionKey) => {
    setSortState(prev => {
      const current = prev[key];
      const currentIndex = SORT_FIELDS.indexOf(current.field);
      const nextField = SORT_FIELDS[(currentIndex + 1) % SORT_FIELDS.length];

      return {
        ...prev,
        [key]: { ...current, field: nextField }
      };
    });
  };

  const toggleSortDirection = (key: SectionKey) => {
    setSortState(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        direction: prev[key].direction === "asc" ? "desc" : "asc"
      }
    }));
  };

  const getSortLabel = (state: SortState) => {
    return `${SORT_FIELD_LABEL[state.field]} • ${state.direction === "asc" ? "↑" : "↓"}`;
  };

  return (
    <div className="collection-page">
      {error && (
        <div className="collection-error">
          <span>{error}</span>
        </div>
      )}

      {STATUS_SECTIONS.map(section => {
        const sectionItems = sortedItems[section.key];
        const isExpanded = expandedSections[section.key];

        return (
          <section key={section.key} className="collection-section">
            <div className="collection-section-header">
              <button
                type="button"
                className="collection-section-toggle"
                onClick={() => toggleSection(section.key)}
                aria-expanded={isExpanded}
              >
                <span className="collection-section-chevron" aria-hidden>
                  {isExpanded ? "▾" : "▸"}
                </span>

                <span className="collection-section-title">
                  {section.label} ({sectionItems.length})
                </span>
              </button>

              <div className="collection-section-controls">
                <button
                  type="button"
                  className="collection-sort-button"
                  onClick={() => cycleSortField(section.key)}
                  title="Change sort field"
                >
                  {getSortLabel(sortState[section.key])}
                </button>

                <button
                  type="button"
                  className="collection-sort-direction"
                  onClick={() => toggleSortDirection(section.key)}
                  title="Toggle sort direction"
                  aria-label={
                    sortState[section.key].direction === "asc"
                      ? "Sort ascending"
                      : "Sort descending"
                  }
                >
                  {sortState[section.key].direction === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>

            {loading && items.length === 0 ? (
              <p className="collection-loading">Loading items…</p>
            ) : !isExpanded ? null : sectionItems.length === 0 ? (
              <p className="collection-empty">{section.emptyText}</p>
            ) : (
              <div className="collection-grid">
                {sectionItems.map(item => (
                  <CollectionCard key={item.id} item={item} to={`/collection/item/${item.id}`} onRevisePrice={handleRevisePrice} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default CollectionPage;
