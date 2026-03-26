import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";
const AUTH_SESSION_STORAGE_KEY = "invotrack-user-session";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  quantity: "",
};

const EMPTY_LOGIN_FORM = {
  employee_id: "",
  password: "",
};

const EMPTY_REGISTER_FORM = {
  username: "",
  employee_id: "",
  password: "",
  confirm_password: "",
};

const EMPTY_AUTH_SESSION = {
  user: null,
  token: "",
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

function isUnauthorizedError(error) {
  return axios.isAxiosError(error) && error.response?.status === 401;
}


function buildAuthHeaders(token) {
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
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
    normalizedFeedback.includes("greater") ||
    normalizedFeedback.includes("error") ||
    normalizedFeedback.includes("already exists") ||
    normalizedFeedback.includes("match")
  ) {
    return "danger";
  }

  if (
    normalizedFeedback.includes("loading") ||
    normalizedFeedback.includes("refresh") ||
    normalizedFeedback.includes("sign in") ||
    normalizedFeedback.includes("create an account")
  ) {
    return "info";
  }

  return "success";
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return EMPTY_AUTH_SESSION;
  }

  try {
    const storedUser = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);

    if (!storedUser) {
      return EMPTY_AUTH_SESSION;
    }

    const parsedSession = JSON.parse(storedUser);
    const parsedUser = parsedSession?.user;
    const parsedToken = parsedSession?.token;

    if (
      typeof parsedUser?.id === "number" &&
      typeof parsedUser?.username === "string" &&
      typeof parsedUser?.employee_id === "string" &&
      typeof parsedToken === "string" &&
      parsedToken.length > 0
    ) {
      return {
        user: parsedUser,
        token: parsedToken,
      };
    }
  } catch (error) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  return EMPTY_AUTH_SESSION;
}

function persistAuthSession(session) {
  if (typeof window === "undefined") {
    return;
  }

  if (session.user === null || !session.token) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function fetchProductsFromApi({
  authToken,
  onUnauthorized,
  setProducts,
  setSelectedProduct,
  selectedProductId,
  setIsLoading,
  setFeedback,
}) {
  try {
    setIsLoading(true);

    const response = await axios.get(`${API_BASE_URL}/products`, {
      headers: buildAuthHeaders(authToken),
    });

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
    if (isUnauthorizedError(error)) {
      onUnauthorized();
      return;
    }

    setFeedback(getErrorMessage(error, "Could not load products from the backend."));
  } finally {
    setIsLoading(false);
  }
}

function AuthScreen({
  authMode,
  feedback,
  isAuthenticating,
  loginForm,
  onLoginChange,
  onLoginSubmit,
  onModeChange,
  onRegisterChange,
  onRegisterSubmit,
  registerForm,
}) {
  const feedbackTone = getFeedbackTone(feedback);
  const isRegisterMode = authMode === "register";

  return (
    <div className="auth-shell">
      <section className="auth-grid">
        <article className="auth-spotlight">
          <span className="eyebrow">Secure Access</span>
          <h1>{isRegisterMode ? "Create your employee account." : "Welcome back to InvoTrack."}</h1>
          <p>
            {isRegisterMode
              ? "Register a new employee profile from the frontend, save it through your FastAPI register API, and start managing inventory right away."
              : "Sign in with the employee account you created from the FastAPI register endpoint to manage products, pricing, and stock updates."}
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature-card">
              <strong>Register from the UI</strong>
              <span>New users can create an account here with username, employee ID, and password.</span>
            </div>

            <div className="auth-feature-card">
              <strong>Employee ID login</strong>
              <span>Your backend signs in with employee id and password through the auth API.</span>
            </div>

            <div className="auth-feature-card">
              <strong>Session memory</strong>
              <span>Your browser keeps the signed-in user after a refresh.</span>
            </div>
          </div>
        </article>

        <section className="panel auth-card">
          <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button
              className={authMode === "login" ? "auth-toggle-btn auth-toggle-btn-active" : "auth-toggle-btn"}
              type="button"
              onClick={() => onModeChange("login")}
            >
              Login
            </button>

            <button
              className={isRegisterMode ? "auth-toggle-btn auth-toggle-btn-active" : "auth-toggle-btn"}
              type="button"
              onClick={() => onModeChange("register")}
            >
              Register
            </button>
          </div>

          <div className="panel-header">
            <span className="panel-kicker">{isRegisterMode ? "Register" : "Login"}</span>
            <h2>{isRegisterMode ? "Create a new employee account" : "Sign in to continue"}</h2>
            <p>
              {isRegisterMode
                ? "This form calls your FastAPI register endpoint and creates a new user record."
                : "Use the same employee id and password you registered in the backend."}
            </p>
          </div>

          <div className={`status-banner status-banner-${feedbackTone}`}>{feedback}</div>

          {isRegisterMode ? (
            <form className="product-form" onSubmit={onRegisterSubmit}>
              <label className="field">
                <span>Username</span>
                <input
                  name="username"
                  type="text"
                  placeholder="Saad"
                  autoComplete="username"
                  value={registerForm.username}
                  onChange={onRegisterChange}
                  disabled={isAuthenticating}
                />
              </label>

              <label className="field">
                <span>Employee ID</span>
                <input
                  name="employee_id"
                  type="text"
                  placeholder="EMP001"
                  autoComplete="username"
                  value={registerForm.employee_id}
                  onChange={onRegisterChange}
                  disabled={isAuthenticating}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  placeholder="Create a password"
                  autoComplete="new-password"
                  value={registerForm.password}
                  onChange={onRegisterChange}
                  disabled={isAuthenticating}
                />
              </label>

              <label className="field">
                <span>Confirm password</span>
                <input
                  name="confirm_password"
                  type="password"
                  placeholder="Repeat the password"
                  autoComplete="new-password"
                  value={registerForm.confirm_password}
                  onChange={onRegisterChange}
                  disabled={isAuthenticating}
                />
              </label>

              <button className="btn btn-primary auth-submit" type="submit" disabled={isAuthenticating}>
                {isAuthenticating ? "Creating account..." : "Register and continue"}
              </button>
            </form>
          ) : (
            <form className="product-form" onSubmit={onLoginSubmit}>
              <label className="field">
                <span>Employee ID</span>
                <input
                  name="employee_id"
                  type="text"
                  placeholder="EMP001"
                  autoComplete="username"
                  value={loginForm.employee_id}
                  onChange={onLoginChange}
                  disabled={isAuthenticating}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={onLoginChange}
                  disabled={isAuthenticating}
                />
              </label>

              <button className="btn btn-primary auth-submit" type="submit" disabled={isAuthenticating}>
                {isAuthenticating ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}

          <p className="auth-footnote">
            {isRegisterMode
              ? "Register uses username, employee ID, and password. After success, the new account is signed in automatically."
              : "Example password format: S@12345. It only needs to match the password used during registration."}
          </p>
        </section>
      </section>
    </div>
  );
}

function App() {
  const [authSession, setAuthSession] = useState(() => readStoredSession());
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
  const [authMode, setAuthMode] = useState("login");
  const [loginForm, setLoginForm] = useState(EMPTY_LOGIN_FORM);
  const [registerForm, setRegisterForm] = useState(EMPTY_REGISTER_FORM);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authFeedback, setAuthFeedback] = useState(
    "Sign in with your employee ID or create an account to access the inventory dashboard."
  );
  const currentUser = authSession.user;
  const authToken = authSession.token;

  useEffect(() => {
    persistAuthSession(authSession);
  }, [authSession]);

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

  function handleAuthModeChange(nextMode) {
    setAuthMode(nextMode);
    setAuthFeedback(
      nextMode === "register"
        ? "Create an account with username, employee ID, and password."
        : "Sign in with your employee ID to access the inventory dashboard."
    );
  }

  const handleAuthFailure = useCallback(() => {
    setAuthSession(EMPTY_AUTH_SESSION);
    setProducts([]);
    setSelectedProduct(null);
    setSearchTerm("");
    setLookupId("");
    setDeleteTargetId(null);
    setIsSubmitting(false);
    setIsLookupLoading(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAuthMode("login");
    setLoginForm(EMPTY_LOGIN_FORM);
    setRegisterForm(EMPTY_REGISTER_FORM);
    setFeedback("Loading inventory from your backend...");
    setAuthFeedback("Your session expired. Sign in again to continue.");
  }, []);

  useEffect(() => {
    if (currentUser === null || !authToken) {
      setIsLoading(false);
      return;
    }

    void fetchProductsFromApi({
      authToken,
      onUnauthorized: handleAuthFailure,
      setProducts,
      setSelectedProduct,
      selectedProductId: null,
      setIsLoading,
      setFeedback,
    });
  }, [authToken, currentUser, handleAuthFailure]);

  async function refreshProducts() {
    if (currentUser === null || !authToken) {
      return;
    }

    await fetchProductsFromApi({
      authToken,
      onUnauthorized: handleAuthFailure,
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

      const response = await axios.get(`${API_BASE_URL}/products/${productId}`, {
        headers: buildAuthHeaders(authToken),
      });

      setSelectedProduct(response.data);
      setLookupId(String(productId));
      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          product.id === response.data.id ? response.data : product
        )
      );
      setFeedback(`Product #${productId} loaded successfully.`);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleAuthFailure();
        return;
      }

      setSelectedProduct(null);
      setFeedback(
        getErrorMessage(error, `Could not load product #${productId} from the backend.`)
      );
    } finally {
      setIsLookupLoading(false);
    }
  }

  function handleInputChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function handleLoginInputChange(event) {
    const { name, value } = event.target;

    setLoginForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function handleRegisterInputChange(event) {
    const { name, value } = event.target;

    setRegisterForm((currentForm) => ({
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

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const employeeId = loginForm.employee_id.trim();
    const password = loginForm.password;

    if (!employeeId || !password) {
      setAuthFeedback("Enter both employee ID and password to sign in.");
      return;
    }

    try {
      setIsAuthenticating(true);

      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        employee_id: employeeId,
        password,
      });

      setAuthSession({
        user: response.data.user,
        token: response.data.access_token,
      });
      setLoginForm(EMPTY_LOGIN_FORM);
      setRegisterForm(EMPTY_REGISTER_FORM);
      setAuthFeedback(response.data.message || "Login successful.");
      setFeedback("Loading inventory from your backend...");
    } catch (error) {
      setAuthFeedback(getErrorMessage(error, "Could not sign in right now."));
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();

    const username = registerForm.username.trim();
    const employeeId = registerForm.employee_id.trim();
    const password = registerForm.password;
    const confirmPassword = registerForm.confirm_password;

    if (!username || !employeeId || !password || !confirmPassword) {
      setAuthFeedback("Complete username, employee ID, password, and confirmation to register.");
      return;
    }

    if (password.length < 6) {
      setAuthFeedback("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setAuthFeedback("Password and confirm password must match.");
      return;
    }

    try {
      setIsAuthenticating(true);

      const response = await axios.post(`${API_BASE_URL}/auth/register`, {
        username,
        employee_id: employeeId,
        password,
      });

      const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
        employee_id: employeeId,
        password,
      });

      setAuthSession({
        user: loginResponse.data.user,
        token: loginResponse.data.access_token,
      });
      setLoginForm(EMPTY_LOGIN_FORM);
      setRegisterForm(EMPTY_REGISTER_FORM);
      setAuthFeedback(`Account created successfully. Welcome, ${response.data.username}.`);
      setFeedback("Loading inventory from your backend...");
    } catch (error) {
      setAuthFeedback(getErrorMessage(error, "Could not create the account right now."));
    } finally {
      setIsAuthenticating(false);
    }
  }

  function handleLogout() {
    setAuthSession(EMPTY_AUTH_SESSION);
    setProducts([]);
    setSelectedProduct(null);
    setSearchTerm("");
    setLookupId("");
    setDeleteTargetId(null);
    setIsSubmitting(false);
    setIsLookupLoading(false);
    setAuthMode("login");
    setLoginForm(EMPTY_LOGIN_FORM);
    setRegisterForm(EMPTY_REGISTER_FORM);
    resetForm();
    setFeedback("Loading inventory from your backend...");
    setAuthFeedback("You have been signed out. Sign in or register to access inventory.");
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
        const response = await axios.put(`${API_BASE_URL}/products/${editingId}`, payload, {
          headers: buildAuthHeaders(authToken),
        });

        setProducts((currentProducts) =>
          currentProducts.map((product) =>
            product.id === editingId ? response.data : product
          )
        );
        setSelectedProduct(response.data);
        setLookupId(String(response.data.id));
        setFeedback(`Product #${response.data.id} updated successfully.`);
      } else {
        const response = await axios.post(`${API_BASE_URL}/products`, payload, {
          headers: buildAuthHeaders(authToken),
        });

        setProducts((currentProducts) => [...currentProducts, response.data]);
        setSelectedProduct(response.data);
        setLookupId(String(response.data.id));
        setFeedback(`Product #${response.data.id} created successfully.`);
      }

      resetForm();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleAuthFailure();
        return;
      }

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

      await axios.delete(`${API_BASE_URL}/products/${productId}`, {
        headers: buildAuthHeaders(authToken),
      });

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
      if (isUnauthorizedError(error)) {
        handleAuthFailure();
        return;
      }

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

  if (currentUser === null) {
    return (
      <AuthScreen
        authMode={authMode}
        feedback={authFeedback}
        isAuthenticating={isAuthenticating}
        loginForm={loginForm}
        onLoginChange={handleLoginInputChange}
        onLoginSubmit={handleLoginSubmit}
        onModeChange={handleAuthModeChange}
        onRegisterChange={handleRegisterInputChange}
        onRegisterSubmit={handleRegisterSubmit}
        registerForm={registerForm}
      />
    );
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
          <div className="session-chip">
            <span>Signed in as</span>
            <strong>{currentUser.username}</strong>
            <small>{currentUser.employee_id}</small>
          </div>

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

          <button className="btn btn-ghost" type="button" onClick={handleLogout}>
            Sign out
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
