/** @module CollectionItemPage */

import { useEffect, useState, type ChangeEvent } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import { useSelector } from "react-redux";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import MuiLink from "@mui/material/Link";

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

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const getListingDisplayName = (url: string) => {
    if (!url) return "";

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");

      if (host.includes("amazon.com")) {
        const match = parsed.pathname.match(/^\/([^/]+)\/dp\//);
        if (match?.[1]) {
          return decodeURIComponent(match[1].replace(/[-_]+/g, " "));
        }
      }

      if (host.includes("ebay.com")) {
        const params = parsed.searchParams;
        const keyword = params.get("_skw") || params.get("keywords");
        if (keyword) {
          return decodeURIComponent(keyword.replace(/\+/g, " "));
        }
        const match = parsed.pathname.match(/\/itm\/(?:\d+\/)?([^/]+)/);
        if (match?.[1]) {
          return decodeURIComponent(match[1].replace(/[-_]+/g, " "));
        }
      }

      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        return decodeURIComponent(segments[segments.length - 1].replace(/[-_]+/g, " "));
      }

      return host;
    } catch {
      return url;
    }
  };

  const getListingSource = (url: string) => {
    if (!url) return "Unknown";

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");

      if (host.includes("amazon.com")) return "Amazon";
      if (host.includes("ebay.com")) return "eBay";

      return host;
    } catch {
      return "Unknown";
    }
  };

  const truncate = (text: string, max = 60) =>
    text.length <= max ? text : `${text.slice(0, max).trim()}…`;

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

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
        const response: unknown = await basicAPI(`${API_URL}/items`, "getUserItems", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!isMounted) return;

        let rawItems: unknown[] = [];

        if (
          response &&
          typeof response === "object" &&
          "items" in response &&
          Array.isArray((response as { items?: unknown[] }).items)
        ) {
          rawItems = (response as { items: unknown[] }).items;
        } else if (Array.isArray(response)) {
          rawItems = response;
        }

        const found = rawItems.find(
          (raw): raw is Record<string, unknown> =>
            typeof raw === "object" &&
            raw !== null &&
            "id" in raw &&
            Number((raw as Record<string, unknown>).id) === itemId
        );

        if (!found) {
          setNotFound(true);
          setItem(null);
          return;
        }

        const raw = found;

        const desc = raw.description;
        const description = typeof desc === "string" ? desc : null;

        const meanVal =
          raw.mean_value != null
            ? Number(raw.mean_value)
            : raw.meanValue != null
              ? Number(raw.meanValue)
              : null;

        const rawListings = Array.isArray(raw.listings) ? raw.listings : [];

        const listings: Listing[] = rawListings.map(r => {
          const listing = r as Record<string, unknown>;

          return {
            url: typeof listing.url === "string" ? listing.url : "",
            condition: typeof listing.condition === "string" ? listing.condition : "",
            price: listing.price != null ? Number(listing.price) : null
          };
        });

        setItem({
          id: Number(raw.id),
          name: typeof raw.name === "string" ? raw.name : "Untitled item",
          status: (raw.status ?? "inventory") as ItemStatus,
          imageUrl:
            typeof raw.imageUrl === "string"
              ? raw.imageUrl
              : typeof raw.image_url === "string"
                ? raw.image_url
                : typeof raw.image === "string"
                  ? raw.image
                  : "",
          price:
            raw.price != null
              ? Number(raw.price)
              : raw.estimated_price != null
                ? Number(raw.estimated_price)
                : null,
          createdAt:
            typeof raw.created_at === "string"
              ? raw.created_at
              : typeof raw.createdAt === "string"
                ? raw.createdAt
                : null,
          description,
          brand: typeof raw.brand === "string" ? raw.brand : null,
          year: raw.year != null ? Number(raw.year) : null,
          condition: typeof raw.condition === "string" ? raw.condition : null,
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
    // TODO
  };

  const handleCreateListing = () => {
    // TODO
  };

  const handleViewListing = () => {
    // TODO
  };

  if (loading) {
    return (
      <div className="collection-item-page">
        <p className="collection-item-loading">Loading item…</p>
        <RouterLink to="/collection" className="collection-item-back">
          ← Back to collection
        </RouterLink>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="collection-item-page">
        <p className="collection-item-error">Item not found.</p>
        <RouterLink to="/collection" className="collection-item-back">
          ← Back to collection
        </RouterLink>
      </div>
    );
  }

  const statusLabel = STATUS_LABEL[item.status];

  const filteredListings = (item.listings ?? []).filter(listing =>
    Boolean(listing.url && listing.url.trim())
  );
  const paginatedListings = filteredListings.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <div className="collection-item-page">
      <RouterLink to="/collection" className="collection-item-back">
        ← Back to collection
      </RouterLink>

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
            {item.meanValue != null && !Number.isNaN(item.meanValue)
              ? `$${Number(item.meanValue).toFixed(2)}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="collection-item-listings-card">
        <h3 className="collection-item-listings-title">Listing references</h3>

        {filteredListings.length > 0 ? (
          <TableContainer component={Paper}>
            <Table size="small" aria-label="listing references">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "60%" }}>Listing</TableCell>
                  <TableCell sx={{ width: "30%" }}>Source</TableCell>
                  <TableCell sx={{ width: "20%" }} align="right">
                    Price
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedListings.map((listing, idx) => {
                  const displayName = truncate(getListingDisplayName(listing.url));
                  return (
                    <TableRow key={`${listing.url}-${idx}`}>
                      <TableCell>
                        <MuiLink href={listing.url} target="_blank" rel="noopener noreferrer">
                          {displayName || listing.url}
                        </MuiLink>
                      </TableCell>
                      <TableCell>{getListingSource(listing.url)}</TableCell>
                      <TableCell align="right">
                        {listing.price != null ? `$${Number(listing.price).toFixed(2)}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={filteredListings.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25]}
            />
          </TableContainer>
        ) : (
          <p className="collection-item-listings-empty">
            No listing references for this appraisal.
          </p>
        )}
      </div>
    </div>
  );
};

export default CollectionItemPage;
