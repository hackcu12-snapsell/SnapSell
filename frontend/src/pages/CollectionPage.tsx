/** @module CollectionPage */

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";

import { CollectionCard } from "../common";
import { API_URL, getItemImageUrl } from "../data/constants";
import { addSnackbar } from "../redux/actions/snackbarActions";
import { toggleModal } from "../redux/actions/modalActions";
import { basicAPI } from "../utils/utilsThisApp";

import SortIcon from "@mui/icons-material/Sort";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import {
  Box,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Typography
} from "@mui/material";

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

  const [sortPopoverAnchor, setSortPopoverAnchor] = useState<HTMLElement | null>(null);
  const [sortPopoverSection, setSortPopoverSection] = useState<SectionKey | null>(null);

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
            price: typeof raw.mean_value === "number" ? raw.mean_value : null,
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
            lastPriceChangeDate:
              typeof raw.last_price_change_date === "string" ? raw.last_price_change_date : null
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
      } else if (item.status === "appraised") {
        // Appraised items are still in inventory; show them in the Inventory section
        base.inventory.push(item);
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

  const openSortPopover = (key: SectionKey, anchor: HTMLElement) => {
    setSortPopoverAnchor(anchor);
    setSortPopoverSection(key);
  };

  const closeSortPopover = () => {
    setSortPopoverAnchor(null);
    setSortPopoverSection(null);
  };

  const setSortField = (key: SectionKey, field: SortField) => {
    setSortState(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        field
      }
    }));
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

  const currentPopoverSortState = sortPopoverSection != null ? sortState[sortPopoverSection] : null;

  const popoverOpen = Boolean(sortPopoverAnchor && sortPopoverSection != null);

  const s = {
    snapBtn: {
      marginTop: "6px",
      alignSelf: "flex-start" as CSSProperties["alignSelf"],
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      background: "#fff",
      color: "#111",
      border: "none",
      borderRadius: "10px",
      padding: "13px 26px",
      fontSize: "1rem",
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit"
    },
    plus: { fontSize: "1.3rem", fontWeight: 300, lineHeight: 1 }
  };

  return (
    <div className="collection-page">
      <div className="collection-page-header">
        <h1 className="collection-page-title">Your collection</h1>
        <button style={s.snapBtn} onClick={() => dispatch(toggleModal("addItemModal"))}>
          <span style={s.plus}>+</span>
          <span className="snappy">Snap an Item</span>
        </button>
      </div>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", margin: "1px 0" }} />

      {error && (
        <div className="collection-error">
          <span>{error}</span>
        </div>
      )}

      {STATUS_SECTIONS.map((section, index) => {
        const sectionItems = sortedItems[section.key];
        const isExpanded = expandedSections[section.key];
        const sectionSortState = sortState[section.key];

        return (
          <Fragment key={section.key}>
            <section className="collection-section">
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
                    {section.label}
                    <span className="collection-section-count">{sectionItems.length}</span>
                  </span>
                </button>

                <div className="collection-section-controls">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SortIcon />}
                    endIcon={
                      sectionSortState.direction === "asc" ? (
                        <ArrowUpwardIcon fontSize="small" />
                      ) : (
                        <ArrowDownwardIcon fontSize="small" />
                      )
                    }
                    onClick={e => openSortPopover(section.key, e.currentTarget)}
                  >
                    {SORT_FIELD_LABEL[sectionSortState.field]}
                  </Button>
                </div>
              </div>

              {loading && items.length === 0 ? (
                <p className="collection-loading">Loading items…</p>
              ) : !isExpanded ? null : sectionItems.length === 0 ? (
                <p className="collection-empty">{section.emptyText}</p>
              ) : (
                <div className="collection-grid">
                  {sectionItems.map(item => (
                    <CollectionCard
                      key={item.id}
                      item={item}
                      to={`/collection/item/${item.id}`}
                      onRevisePrice={handleRevisePrice}
                    />
                  ))}
                </div>
              )}
            </section>

            {index < STATUS_SECTIONS.length - 1 ? (
              <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mt: 0, mb: 0 }} />
            ) : null}
          </Fragment>
        );
      })}

      <Popover
        open={popoverOpen}
        anchorEl={sortPopoverAnchor}
        onClose={closeSortPopover}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ width: 220, p: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Sort by
          </Typography>

          <List dense>
            {SORT_FIELDS.map(field => (
              <ListItemButton
                key={field}
                selected={currentPopoverSortState?.field === field}
                onClick={() => {
                  if (!sortPopoverSection) return;
                  setSortField(sortPopoverSection, field);
                  closeSortPopover();
                }}
              >
                <ListItemText primary={SORT_FIELD_LABEL[field]} />
              </ListItemButton>
            ))}
          </List>

          <Divider sx={{ my: 1 }} />

          <Button
            fullWidth
            size="small"
            variant="outlined"
            startIcon={
              currentPopoverSortState?.direction === "asc" ? (
                <ArrowUpwardIcon fontSize="small" />
              ) : (
                <ArrowDownwardIcon fontSize="small" />
              )
            }
            onClick={() => {
              if (!sortPopoverSection) return;
              toggleSortDirection(sortPopoverSection);
              closeSortPopover();
            }}
          >
            {currentPopoverSortState?.direction === "asc" ? "Ascending" : "Descending"}
          </Button>
        </Box>
      </Popover>
    </div>
  );
};

export default CollectionPage;
