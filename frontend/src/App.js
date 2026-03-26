import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";
const GOOGLE_CLIENT_ID =
  process.env.REACT_APP_GOOGLE_CLIENT_ID ||
  "617455632614-lpu5pdcl5rbmoiq77spd7dmc1cvhgkl8.apps.googleusercontent.com";
const AUTH_SESSION_STORAGE_KEY = "invotrack-user-session";
const COMPANY_GOOGLE_DOMAINS = [
  "menascouae.com",
  "menascoadmin.com",
  "menascoksa.com",
];

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  quantity: "",
};

const EMPTY_AUTH_SESSION = {
  user: null,
  token: "",
};

const EMPTY_PENDING_SETUP = {
  setupToken: "",
  user: null,
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
    normalizedFeedback.includes("match") ||
    normalizedFeedback.includes("missing")
  ) {
    return "danger";
  }

  if (
    normalizedFeedback.includes("loading") ||
    normalizedFeedback.includes("refresh") ||
    normalizedFeedback.includes("sign in") ||
    normalizedFeedback.includes("google") ||
    normalizedFeedback.includes("complete")
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
      typeof parsedUser?.email === "string" &&
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
  employeeId,
  feedback,
  isAuthenticating,
  googleClientId,
  isCompletingProfile,
  isGoogleReady,
  onEmployeeIdChange,
  onEmployeeIdSubmit,
  onGoogleCredential,
  onResetPendingSetup,
  pendingSetupUser,
}) {
  const googleButtonRef = useRef(null);
  const feedbackTone = getFeedbackTone(feedback);
  const isEmployeeIdStep = pendingSetupUser !== null;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      isEmployeeIdStep ||
      !googleClientId ||
      !isGoogleReady ||
      googleButtonRef.current === null ||
      window.google?.accounts?.id === undefined
    ) {
      return;
    }

    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        const credential = response?.credential;
        if (typeof credential === "string" && credential) {
          void onGoogleCredential(credential);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: false,
      ux_mode: "popup",
    });
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: 360,
    });
  }, [googleClientId, isEmployeeIdStep, isGoogleReady, onGoogleCredential]);

  return (
    <div className="auth-shell">
      <section className="auth-grid">
        <article className="auth-spotlight">
          <span className="eyebrow">Secure Access</span>
          <h1>{isEmployeeIdStep ? "One last step." : "Company Google sign-in only."}</h1>
          <p>
            {isEmployeeIdStep
              ? "Your Google account is verified. Add your employee ID once and the backend will finish creating your employee profile."
              : "Sign in with your approved company Google account and the backend will issue a JWT for the inventory workspace."}
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature-card">
              <strong>Approved company domains</strong>
              <span>{COMPANY_GOOGLE_DOMAINS.join(" | ")}</span>
            </div>

            <div className="auth-feature-card">
              <strong>Employee ID required</strong>
              <span>First-time users add their employee ID after Google verification.</span>
            </div>

            <div className="auth-feature-card">
              <strong>Backend JWT session</strong>
              <span>Your FastAPI backend still controls the session token for every API request.</span>
            </div>
          </div>
        </article>

        <section className="panel auth-card">
          <div className="panel-header">
            <span className="panel-kicker">{isEmployeeIdStep ? "Complete Profile" : "Google Sign-In"}</span>
            <h2>{isEmployeeIdStep ? "Save your employee ID" : "Continue with your company account"}</h2>
            <p>
              {isEmployeeIdStep
                ? "We already captured your company email and Google identity. Add your employee ID to finish onboarding."
                : "Use Google sign-in to verify your company account. The backend will create or reuse your local user and return its own JWT."}
            </p>
          </div>

          <div className={`status-banner status-banner-${feedbackTone}`}>{feedback}</div>

          {isEmployeeIdStep ? (
            <form className="product-form" onSubmit={onEmployeeIdSubmit}>
              <label className="field">
                <span>Username</span>
                <input type="text" value={pendingSetupUser.username} disabled />
              </label>

              <label className="field">
                <span>Company email</span>
                <input type="email" value={pendingSetupUser.email} disabled />
              </label>

              <label className="field">
                <span>Employee ID</span>
                <input
                  name="employee_id"
                  type="text"
                  placeholder="EMP001"
                  autoComplete="off"
                  value={employeeId}
                  onChange={onEmployeeIdChange}
                  disabled={isCompletingProfile}
                />
              </label>

              <div className="button-row">
                <button className="btn btn-primary auth-submit" type="submit" disabled={isCompletingProfile}>
                  {isCompletingProfile ? "Saving employee ID..." : "Save employee ID"}
                </button>

                <button
                  className="btn btn-ghost auth-submit"
                  type="button"
                  onClick={onResetPendingSetup}
                  disabled={isCompletingProfile}
                >
                  Start over
                </button>
              </div>
            </form>
          ) : (
            <div className="product-form">
              <div className="google-button-shell">
                {!googleClientId ? (
                  <div className="support-card">
                    <strong>Google client ID missing</strong>
                    <p>Add `REACT_APP_GOOGLE_CLIENT_ID` to the frontend and `GOOGLE_CLIENT_ID` to the backend.</p>
                  </div>
                ) : !isGoogleReady ? (
                  <div className="support-card">
                    <strong>Loading Google sign-in</strong>
                    <p>The browser is waiting for Google Identity Services to finish loading.</p>
                  </div>
                ) : (
                  <div ref={googleButtonRef} />
                )}
              </div>

              <div className="support-card">
                <strong>Sign-in requirements</strong>
                <p>Use one of your approved company Google accounts. Personal Google accounts are rejected by the backend.</p>
              </div>

              {isAuthenticating ? (
                <div className="support-card">
                  <strong>Verifying account</strong>
                  <p>Your Google identity is being checked and linked to your local employee profile.</p>
                </div>
              ) : null}
            </div>
          )}

          <p className="auth-footnote">
            {isEmployeeIdStep
              ? "Your employee ID is only requested when the backend sees this is your first Google sign-in."
              : "After Google verifies your company account, the backend signs you into this app with its own JWT."}
          </p>
        </section>
      </section>
    </div>
  );
}

function App() {
  const [authSession, setAuthSession] = useState(() => readStoredSession());
  const [pendingSetup, setPendingSetup] = useState(EMPTY_PENDING_SETUP);
  const [employeeId, setEmployeeId] = useState("");
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
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.google?.accounts?.id)
  );
  const [feedback, setFeedback] = useState("Loading inventory from your backend...");
  const [authFeedback, setAuthFeedback] = useState(
    "Sign in with your approved company Google account to access the inventory dashboard."
  );
  const currentUser = authSession.user;
  const authToken = authSession.token;

  useEffect(() => {
    persistAuthSession(authSession);
  }, [authSession]);

  useEffect(() => {
    if (typeof window === "undefined" || isGoogleReady) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        setIsGoogleReady(true);
        window.clearInterval(intervalId);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isGoogleReady]);

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

  const resetPendingSetup = useCallback(() => {
    setPendingSetup(EMPTY_PENDING_SETUP);
    setEmployeeId("");
    setAuthFeedback("Sign in with your approved company Google account to access the inventory dashboard.");
  }, []);

  function clearWorkspace() {
    setSearchTerm("");
    setLookupId("");
    setSelectedProduct(null);
    resetForm();
    setFeedback("Workspace cleared.");
  }

  const handleAuthFailure = useCallback(() => {
    setAuthSession(EMPTY_AUTH_SESSION);
    setPendingSetup(EMPTY_PENDING_SETUP);
    setEmployeeId("");
    setProducts([]);
    setSelectedProduct(null);
    setSearchTerm("");
    setLookupId("");
    setDeleteTargetId(null);
    setIsSubmitting(false);
    setIsLookupLoading(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFeedback("Loading inventory from your backend...");
    setAuthFeedback("Your session expired. Sign in again with your company Google account.");
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

  function handleEmployeeIdChange(event) {
    setEmployeeId(event.target.value);
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

  const handleGoogleCredential = useCallback(async (credential) => {
    try {
      setIsAuthenticating(true);

      const response = await axios.post(`${API_BASE_URL}/auth/google`, {
        credential,
      });

      if (response.data.requires_employee_id) {
        setPendingSetup({
          setupToken: response.data.setup_token,
          user: response.data.user,
        });
        setEmployeeId("");
        setAuthFeedback(response.data.message || "Enter your employee ID to complete setup.");
        return;
      }

      setPendingSetup(EMPTY_PENDING_SETUP);
      setEmployeeId("");
      setAuthSession({
        user: response.data.user,
        token: response.data.access_token,
      });
      setAuthFeedback(response.data.message || "Login successful.");
      setFeedback("Loading inventory from your backend...");
    } catch (error) {
      resetPendingSetup();
      setAuthFeedback(getErrorMessage(error, "Could not sign in with Google right now."));
    } finally {
      setIsAuthenticating(false);
    }
  }, [resetPendingSetup]);

  async function handleCompleteProfileSubmit(event) {
    event.preventDefault();

    const nextEmployeeId = employeeId.trim();

    if (!nextEmployeeId) {
      setAuthFeedback("Enter your employee ID to complete the first-time setup.");
      return;
    }

    if (!pendingSetup.setupToken) {
      setAuthFeedback("Google setup expired. Please sign in again.");
      resetPendingSetup();
      return;
    }

    try {
      setIsCompletingProfile(true);

      const response = await axios.post(`${API_BASE_URL}/auth/complete-profile`, {
        employee_id: nextEmployeeId,
        setup_token: pendingSetup.setupToken,
      });

      setPendingSetup(EMPTY_PENDING_SETUP);
      setEmployeeId("");
      setAuthSession({
        user: response.data.user,
        token: response.data.access_token,
      });
      setAuthFeedback(response.data.message || "Employee ID saved successfully.");
      setFeedback("Loading inventory from your backend...");
    } catch (error) {
      setAuthFeedback(getErrorMessage(error, "Could not save your employee ID right now."));
    } finally {
      setIsCompletingProfile(false);
    }
  }

  function handleLogout() {
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }

    setAuthSession(EMPTY_AUTH_SESSION);
    setPendingSetup(EMPTY_PENDING_SETUP);
    setEmployeeId("");
    setProducts([]);
    setSelectedProduct(null);
    setSearchTerm("");
    setLookupId("");
    setDeleteTargetId(null);
    setIsSubmitting(false);
    setIsLookupLoading(false);
    resetForm();
    setFeedback("Loading inventory from your backend...");
    setAuthFeedback("You have been signed out. Sign in again with your company Google account.");
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
        employeeId={employeeId}
        feedback={authFeedback}
        googleClientId={GOOGLE_CLIENT_ID}
        isAuthenticating={isAuthenticating}
        isCompletingProfile={isCompletingProfile}
        isGoogleReady={isGoogleReady}
        onEmployeeIdChange={handleEmployeeIdChange}
        onEmployeeIdSubmit={handleCompleteProfileSubmit}
        onGoogleCredential={handleGoogleCredential}
        onResetPendingSetup={resetPendingSetup}
        pendingSetupUser={pendingSetup.user}
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
            <small>{currentUser.email}</small>
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
