import axios from "axios";
import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  quantity: "",
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function getErrorMessage(error, fallbackMessage) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.message || fallbackMessage;
  }

  return fallbackMessage;
}

function getStockLabel(quantity) {
  if (quantity === 0) {
    return "Out of stock";
  }

  if (quantity <= 5) {
    return "Low stock";
  }

  return "Healthy";
}

function getStockTone(quantity) {
  if (quantity === 0) {
    return "danger";
  }

  if (quantity <= 5) {
    return "warning";
  }

  return "success";
}

function getFeedbackTone(feedback) {
  const normalizedFeedback = feedback.toLowerCase();

  if (
    normalizedFeedback.includes("could not") ||
    normalizedFeedback.includes("valid") ||
    normalizedFeedback.includes("greater")
  ) {
    return "danger";
  }

  if (normalizedFeedback.includes("loading") || normalizedFeedback.includes("refresh")) {
    return "info";
  }

  return "success";
}

async function fetchProductsFromApi({
  setProducts,
  setSelectedProduct,
  selectedProductId,
  setIsLoading,
  setFeedback,
}) {
  try {
    setIsLoading(true);

    // GET /products
    // This loads the full inventory list from FastAPI and fills the table.
    const response = await axios.get(`${API_BASE_URL}/products`);

    setProducts(response.data);

    if (selectedProductId !== null) {
      const updatedSelectedProduct =
        response.data.find((product) => product.id === selectedProductId) ?? null;
      setSelectedProduct(updatedSelectedProduct);
    }

    setFeedback(
      response.data.length === 0
        ? "No products found in the backend yet."
        : "Inventory synced successfully."
    );
  } catch (error) {
    setFeedback(getErrorMessage(error, "Could not load products from the backend."));
  } finally {
    setIsLoading(false);
  }
}

function App() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [feedback, setFeedback] = useState("Loading inventory from your backend...");

  useEffect(() => {
    void fetchProductsFromApi({
      setProducts,
      setSelectedProduct,
      selectedProductId: null,
      setIsLoading,
      setFeedback,
    });
  }, []);

  const totalProducts = products.length;
  const totalUnits = products.reduce(
    (runningTotal, product) => runningTotal + product.quantity,
    0
  );
  const lowStockCount = products.filter((product) => product.quantity <= 5).length;
  const inventoryValue = products.reduce(
    (runningTotal, product) => runningTotal + product.price * product.quantity,
    0
  );
  const lowStockProducts = products
    .filter((product) => product.quantity <= 5)
    .sort((firstProduct, secondProduct) => firstProduct.quantity - secondProduct.quantity)
    .slice(0, 4);

  const filteredProducts = [...products]
    .filter((product) => {
      const query = searchTerm.trim().toLowerCase();

      if (!query) {
        return true;
      }

      return (
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query) ||
        String(product.id).includes(query)
      );
    })
    .sort((firstProduct, secondProduct) => firstProduct.id - secondProduct.id);

  const feedbackTone = getFeedbackTone(feedback);
  const isEditing = editingId !== null;

  async function refreshProducts() {
    await fetchProductsFromApi({
      setProducts,
      setSelectedProduct,
      selectedProductId: selectedProduct?.id ?? null,
      setIsLoading,
      setFeedback,
    });
  }

  async function fetchProductById(productId) {
    try {
      setIsLookupLoading(true);

      // GET /products/{product_id}
      // This fetches a single record so the detail panel shows the latest backend data.
      const response = await axios.get(`${API_BASE_URL}/products/${productId}`);

      setSelectedProduct(response.data);
      setLookupId(String(productId));
      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          product.id === response.data.id ? response.data : product
        )
      );
      setFeedback(`Product #${productId} loaded successfully.`);
    } catch (error) {
      setSelectedProduct(null);
      setFeedback(
        getErrorMessage(error, `Could not load product #${productId} from the backend.`)
      );
    } finally {
      setIsLookupLoading(false);
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function clearWorkspace() {
    setSearchTerm("");
    setLookupId("");
    setSelectedProduct(null);
    resetForm();
    setFeedback("Workspace cleared.");
  }

  function handleInputChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function handleEdit(product) {
    setEditingId(product.id);
    setSelectedProduct(product);
    setLookupId(String(product.id));
    setForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      quantity: String(product.quantity),
    });
    setFeedback(`Editing product #${product.id}. Save changes to update the backend.`);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const name = form.name.trim();
    const description = form.description.trim();
    const price = Number(form.price);
    const quantity = Number(form.quantity);

    if (!name || !description || Number.isNaN(price) || Number.isNaN(quantity)) {
      setFeedback("Please complete name, description, price, and quantity.");
      return;
    }

    if (price < 0 || quantity < 0) {
      setFeedback("Price and quantity must be zero or greater.");
      return;
    }

    const payload = {
      name,
      description,
      price: Number(price.toFixed(2)),
      quantity: Math.floor(quantity),
    };

    try {
      setIsSubmitting(true);

      if (isEditing) {
        // PUT /products/{product_id}
        // This sends the updated form values to FastAPI for the selected product id.
        const response = await axios.put(
          `${API_BASE_URL}/products/${editingId}`,
          payload
        );

        setProducts((currentProducts) =>
          currentProducts.map((product) =>
            product.id === editingId ? response.data : product
          )
        );
        setSelectedProduct(response.data);
        setLookupId(String(response.data.id));
        setFeedback(`Product #${response.data.id} updated successfully.`);
      } else {
        // POST /products
        // This sends a new product object to FastAPI and adds the created row to the table.
        const response = await axios.post(`${API_BASE_URL}/products`, payload);

        setProducts((currentProducts) => [...currentProducts, response.data]);
        setSelectedProduct(response.data);
        setLookupId(String(response.data.id));
        setFeedback(`Product #${response.data.id} created successfully.`);
      }

      resetForm();
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not save the product."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(productId) {
    const productToDelete = products.find((product) => product.id === productId);

    if (!productToDelete) {
      return;
    }

    if (!window.confirm(`Delete product #${productId} from the backend?`)) {
      return;
    }

    try {
      setDeleteTargetId(productId);

      // DELETE /products/{product_id}
      // This removes the product in FastAPI, then removes the same row from React state.
      await axios.delete(`${API_BASE_URL}/products/${productId}`);

      setProducts((currentProducts) =>
        currentProducts.filter((product) => product.id !== productId)
      );

      if (editingId === productId) {
        resetForm();
      }

      if (selectedProduct?.id === productId) {
        setSelectedProduct(null);
      }

      if (lookupId === String(productId)) {
        setLookupId("");
      }

      setFeedback(`Product #${productId} deleted successfully.`);
    } catch (error) {
      setFeedback(getErrorMessage(error, `Could not delete product #${productId}.`));
    } finally {
      setDeleteTargetId(null);
    }
  }

  async function handleLookupSubmit(event) {
    event.preventDefault();

    const productId = Number(lookupId);

    if (Number.isNaN(productId)) {
      setFeedback("Enter a valid product id before searching.");
      return;
    }

    await fetchProductById(productId);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <span className="eyebrow">Inventory Dashboard</span>
          <h1>Product inventory</h1>
          <p>
            A clean workspace for managing products, pricing, and stock levels in
            your FastAPI project.
          </p>
        </div>

        <div className="topbar-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void refreshProducts()}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh data"}
          </button>

          <button className="btn btn-ghost" type="button" onClick={clearWorkspace}>
            Clear workspace
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-label">Products</span>
          <strong>{totalProducts}</strong>
          <small>Total records available</small>
        </article>

        <article className="stat-card">
          <span className="stat-label">Units in stock</span>
          <strong>{totalUnits}</strong>
          <small>Combined inventory quantity</small>
        </article>

        <article className="stat-card">
          <span className="stat-label">Low stock items</span>
          <strong>{lowStockCount}</strong>
          <small>Products with quantity 5 or less</small>
        </article>

        <article className="stat-card">
          <span className="stat-label">Inventory value</span>
          <strong>{currencyFormatter.format(inventoryValue)}</strong>
          <small>Price multiplied by quantity</small>
        </article>
      </section>

      <main className="workspace">
        <section className="panel form-panel">
          <div className="panel-header">
            <span className="panel-kicker">{isEditing ? "Edit Product" : "New Product"}</span>
            <h2>{isEditing ? "Update product" : "Create product"}</h2>
            <p>All fields map directly to your backend schema.</p>
          </div>

          <div className={`status-banner status-banner-${feedbackTone}`}>{feedback}</div>

          <form className="product-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Name</span>
              <input
                name="name"
                type="text"
                placeholder="Laptop"
                value={form.name}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </label>

            <label className="field">
              <span>Description</span>
              <textarea
                name="description"
                rows="5"
                placeholder="Short product description"
                value={form.description}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Price</span>
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="999.99"
                  value={form.price}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                />
              </label>

              <label className="field">
                <span>Quantity</span>
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="10"
                  value={form.quantity}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                />
              </label>
            </div>

            <div className="button-row">
              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? isEditing
                    ? "Saving..."
                    : "Creating..."
                  : isEditing
                    ? "Save changes"
                    : "Create product"}
              </button>

              <button
                className="btn btn-ghost"
                type="button"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Clear form
              </button>
            </div>
          </form>

          <div className="support-card">
            <strong>Live backend connected</strong>
            <p>New, updated, and deleted records are synced directly with FastAPI.</p>
          </div>
        </section>

        <div className="content-stack">
          <section className="panel">
            <div className="panel-header panel-header-spread">
              <div>
                <span className="panel-kicker">Catalog</span>
                <h2>Products</h2>
                <p>
                  {filteredProducts.length} of {totalProducts} products shown
                </p>
              </div>

              <label className="search-field">
                <span>Search</span>
                <input
                  type="text"
                  placeholder="Search by id, name, or description"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
            </div>

            {isLoading ? (
              <div className="empty-state">
                <h3>Loading inventory...</h3>
                <p>Your frontend is waiting for the backend response.</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state">
                <h3>No products found</h3>
                <p>Add a product or refresh the list to pull the latest backend data.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="product-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Price</th>
                      <th>Quantity</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProducts.map((product) => {
                      const isSelected = selectedProduct?.id === product.id;
                      const isDeleting = deleteTargetId === product.id;

                      return (
                        <tr
                          key={product.id}
                          className={isSelected ? "product-row product-row-active" : "product-row"}
                        >
                          <td>
                            <span className="id-badge">#{product.id}</span>
                          </td>
                          <td className="cell-strong">{product.name}</td>
                          <td className="description-cell">{product.description}</td>
                          <td>{currencyFormatter.format(product.price)}</td>
                          <td>{product.quantity}</td>
                          <td>
                            <span className={`pill pill-${getStockTone(product.quantity)}`}>
                              {getStockLabel(product.quantity)}
                            </span>
                          </td>
                          <td className="actions-cell">
                            <button
                              className="table-btn"
                              type="button"
                              onClick={() => void fetchProductById(product.id)}
                            >
                              View
                            </button>

                            <button
                              className="table-btn"
                              type="button"
                              onClick={() => handleEdit(product)}
                            >
                              Edit
                            </button>

                            <button
                              className="table-btn table-btn-danger"
                              type="button"
                              onClick={() => void handleDelete(product.id)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="detail-grid">
            <section className="panel">
              <div className="panel-header">
                <span className="panel-kicker">Detail View</span>
                <h2>Selected product</h2>
                <p>Search by id or inspect the product you last created or updated.</p>
              </div>

              <form className="lookup-form" onSubmit={handleLookupSubmit}>
                <div className="lookup-row">
                  <label className="field field-grow">
                    <span>Product id</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Enter product id"
                      value={lookupId}
                      onChange={(event) => setLookupId(event.target.value)}
                    />
                  </label>

                  <button className="btn btn-primary" type="submit" disabled={isLookupLoading}>
                    {isLookupLoading ? "Loading..." : "Find product"}
                  </button>
                </div>
              </form>

              {selectedProduct ? (
                <div className="detail-card">
                  <div className="detail-header">
                    <div>
                      <span className="detail-id">Product #{selectedProduct.id}</span>
                      <h3>{selectedProduct.name}</h3>
                    </div>

                    <span className={`pill pill-${getStockTone(selectedProduct.quantity)}`}>
                      {getStockLabel(selectedProduct.quantity)}
                    </span>
                  </div>

                  <p className="detail-description">{selectedProduct.description}</p>

                  <div className="detail-metrics">
                    <article>
                      <span>Price</span>
                      <strong>{currencyFormatter.format(selectedProduct.price)}</strong>
                    </article>

                    <article>
                      <span>Quantity</span>
                      <strong>{selectedProduct.quantity}</strong>
                    </article>
                  </div>

                  <div className="button-row">
                    <button
                      className="table-btn"
                      type="button"
                      onClick={() => handleEdit(selectedProduct)}
                    >
                      Edit selected
                    </button>

                    <button
                      className="table-btn table-btn-danger"
                      type="button"
                      onClick={() => void handleDelete(selectedProduct.id)}
                      disabled={deleteTargetId === selectedProduct.id}
                    >
                      {deleteTargetId === selectedProduct.id ? "Deleting..." : "Delete selected"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state compact-empty-state">
                  <h3>No product selected</h3>
                  <p>Use the table or search by id to load one product into this panel.</p>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <span className="panel-kicker">Attention</span>
                <h2>Stock alerts</h2>
                <p>Quick visibility into products that need restocking soon.</p>
              </div>

              {lowStockProducts.length === 0 ? (
                <div className="empty-state compact-empty-state">
                  <h3>Everything looks healthy</h3>
                  <p>No products are currently in the low-stock range.</p>
                </div>
              ) : (
                <div className="alert-list">
                  {lowStockProducts.map((product) => (
                    <button
                      className="alert-item"
                      type="button"
                      key={product.id}
                      onClick={() => void fetchProductById(product.id)}
                    >
                      <div className="alert-copy">
                        <strong>{product.name}</strong>
                        <span>#{product.id}</span>
                      </div>

                      <div className="alert-meta">
                        <span className={`pill pill-${getStockTone(product.quantity)}`}>
                          {getStockLabel(product.quantity)}
                        </span>
                        <small>{product.quantity} units left</small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
