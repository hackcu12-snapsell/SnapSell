import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import "../App.css";
import { CollectionCard } from "../common";
import { API_URL } from "../data/constants";
import { addSnackbar } from "../redux/actions/snackbarActions";
import { basicAPI } from "../utils/utilsThisApp";

type ItemStatus = "inventory" | "listed" | "sold" | "appraised";

type Item = {
  id: number;
  name: string;
  status: ItemStatus;
  imageUrl: string;
  price?: number | null;
  createdAt?: string | null;
};

type SortOption = "alphabetical" | "price-desc" | "recent";

type SectionKey = Exclude<ItemStatus, "appraised">;

type RootState = {
  userState: {
    loginResult: {
      userID: number;
      token: string;
      username?: string;
      userFirstName?: string;
      userLastName?: string;
    } | null;
  };
};

const STATUS_SECTIONS: { key: Exclude<ItemStatus, "appraised">; label: string; emptyText: string }[] = [
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

/** Temporary mock data for preview when not logged in / no backend */
const MOCK_ITEMS: Item[] = [
  { id: 1, name: "Vintage Camera", status: "inventory", imageUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400", price: 125, createdAt: "2025-01-01T10:00:00Z" },
  { id: 2, name: "Retro Sneakers", status: "inventory", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400", price: 89, createdAt: "2025-01-02T10:00:00Z" },
  { id: 3, name: "Record Player", status: "listed", imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400", price: 220, createdAt: "2025-01-03T10:00:00Z" },
  { id: 4, name: "Leather Jacket", status: "listed", imageUrl: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400", price: 175, createdAt: "2025-01-04T10:00:00Z" },
  { id: 5, name: "Designer Watch", status: "sold", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400", price: 450, createdAt: "2025-01-05T10:00:00Z" },
  { id: 6, name: "Vinyl Collection", status: "sold", imageUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400", price: 95, createdAt: "2025-01-06T10:00:00Z" }
];

const CollectionPage = () => {
  const dispatch = useDispatch();
  const loginResult = useSelector((state: RootState) => state.userState.loginResult);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<Record<SectionKey, SortOption>>({
    inventory: "recent",
    listed: "recent",
    sold: "recent"
  });

  const token = loginResult?.token;

  useEffect(() => {
    let isMounted = true;

    const fetchItems = async () => {
      // Temporary: use mock data when not logged in (no backend)
      if (!token) {
        setItems(MOCK_ITEMS);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response: any = await basicAPI(`${API_URL}/items`, "getUserItems", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!isMounted) return;

        const rawItems: any[] = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : [];

        const mapped: Item[] = rawItems.map(raw => ({
          id: raw.id,
          name: raw.name ?? "Untitled item",
          status: (raw.status ?? "inventory") as ItemStatus,
          imageUrl: raw.imageUrl ?? raw.image_url ?? raw.image ?? "",
          price: raw.price ?? raw.estimated_price ?? null,
          createdAt: raw.created_at ?? raw.createdAt ?? null
        }));

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

  const groupedItems = useMemo(() => {
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

    const sortItems = (list: Item[], option: SortOption): Item[] => {
      const arr = [...list];
      if (option === "alphabetical") {
        arr.sort((a, b) => a.name.localeCompare(b.name));
      } else if (option === "price-desc") {
        arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      } else {
        arr.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
          return bDate - aDate;
        });
      }
      return arr;
    };

    return {
      inventory: sortItems(base.inventory, sortBy.inventory),
      listed: sortItems(base.listed, sortBy.listed),
      sold: sortItems(base.sold, sortBy.sold)
    };
  }, [items, sortBy]);

  return (
    <div className="collection-page">
      {error && (
        <div className="collection-error">
          <span>{error}</span>
        </div>
      )}

      {STATUS_SECTIONS.map(section => {
        const sectionItems = groupedItems[section.key];

        return (
          <section key={section.key} className="collection-section">
            <div className="collection-section-header">
              <h2 className="collection-section-title">{section.label}</h2>
              <select
                aria-label={`Sort ${section.label} by`}
                className="collection-sort-select"
                value={sortBy[section.key]}
                onChange={e =>
                  setSortBy(prev => ({ ...prev, [section.key]: e.target.value as SortOption }))
                }
              >
                <option value="alphabetical">Alphabetical</option>
                <option value="price-desc">Price (High to Low)</option>
                <option value="recent">Recently Added</option>
              </select>
            </div>
            {loading && items.length === 0 ? (
              <p className="collection-loading">Loading items…</p>
            ) : sectionItems.length === 0 ? (
              <p className="collection-empty">{section.emptyText}</p>
            ) : (
              <div className="collection-grid">
                {sectionItems.map(item => (
                  <CollectionCard key={item.id} item={item} to={`/collection/item/${item.id}`} />
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

