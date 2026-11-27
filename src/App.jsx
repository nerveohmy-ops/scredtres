import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, MessageCircle, SearchX, Package, AlertCircle, X, ShoppingBag, Check, ArrowUp } from 'lucide-react';
import { store, reconcileCartWithProducts } from './utils/store';
import { SEED_PRODUCTS } from './data/seedProducts';
import { fetchCatalogBootstrap, sendAdminAction } from './utils/api';
import {
  tg,
  initTelegramApp,
  getTelegramUser,
  setClosingConfirmation,
  setBackButton,
  openTelegramLink,
  haptic
} from './utils/telegram';
import { ROLES, resolveUserRole, canManageProducts, isLocalDevEnvironment } from './utils/roles';

import Header from './components/Header';
import HeroBanner from './components/HeroBanner';
import SearchBar from './components/SearchBar';
import CategoryFilter from './components/CategoryFilter';
import ProductCard from './components/ProductCard';
import ProductModal from './components/ProductModal';
import CartDrawer from './components/CartDrawer';
import CheckoutModal from './components/CheckoutModal';
import FavoritesView from './components/FavoritesView';
import ReviewsView from './components/ReviewsView';
import ProfileView from './components/ProfileView';
import AdminPanel from './components/AdminPanel';
import BottomNav from './components/BottomNav';
import Footer from './components/Footer';

const CATALOG_PAGE_SIZE = 24;

const sameProductSnapshot = (a, b) => {
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    (a.brand || '') === (b.brand || '') &&
    a.category === b.category &&
    (a.availability || 'pre_order') === (b.availability || 'pre_order') &&
    Number(a.price) === Number(b.price) &&
    (a.oldPrice ?? null) === (b.oldPrice ?? null) &&
    (a.description || '') === (b.description || '') &&
    JSON.stringify(a.sizes || []) === JSON.stringify(b.sizes || []) &&
    JSON.stringify(a.images || []) === JSON.stringify(b.images || [])
  );
};

export default function App() {
  // Persistent store states
  const [localSavedProducts, setLocalSavedProducts] = useState(() => store.getProducts());
  const [products, setProducts] = useState(() => {
    const saved = store.getProducts();
    return saved.length > 0 ? saved : SEED_PRODUCTS;
  });
  const [infoItems, setInfoItems] = useState(() => store.getInfoItems());
  const [orders, setOrders] = useState(() => store.getOrders());
  const [promos, setPromos] = useState(() => store.getPromos());
  const [settings, setSettings] = useState(() => store.getSettings());
  const [cart, setCart] = useState(() =>
    store
      .getCart()
      .map((item) => {
        if (item?.product?.id) return item;
        if (item?.id) {
          const { size = 'ONE SIZE', quantity = 1, ...rest } = item;
          return { product: rest, size, quantity };
        }
        return null;
      })
      .filter((item) => item && item.product?.id && Number(item.quantity) > 0)
  );
  const [favorites, setFavorites] = useState(() => store.getFavorites());
  const [dbConfigured, setDbConfigured] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [dbError, setDbError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const [localSyncNotice, setLocalSyncNotice] = useState('');
  const [hasPromosServer, setHasPromosServer] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [cartNotice, setCartNotice] = useState('');

  // Role & User (localhost preview override only works off-Telegram on localhost)
  const [devRoleOverride, setDevRoleOverride] = useState(null);
  const [serverRole, setServerRole] = useState(null);
  const tgUser = getTelegramUser(devRoleOverride);
  const role = resolveUserRole(tgUser, devRoleOverride, serverRole);
  const isStaff = canManageProducts(role);
  const isBrowserGuest = dbConfigured && !tg?.initData && !isLocalDevEnvironment();
  const supportUsername = (settings?.supportUsername || 'dybriansik').replace(/^@/, '');

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState('catalog');
  const [activeCategory, setActiveCategory] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE);

  // Overlays & Modals
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [cartToast, setCartToast] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 360;
      setShowScrollTop((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const catalogRef = useRef(null);
  const loadMoreRef = useRef(null);
  const lastSyncRef = useRef(0);
  const cartToastTimerRef = useRef(null);

  const syncCatalogFromServer = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 5000) return;
    lastSyncRef.current = now;

    setIsRefreshing(true);
    const data = await fetchCatalogBootstrap();
    setIsRefreshing(false);
    setBootstrapDone(true);

    if (data?.networkError) {
      setSyncError('Нет соединения с сервером. Проверьте интернет и обновите страницу.');
      return;
    }

    if (!data?.configured) return;

    setDbConfigured(true);
    if (data.dbError) {
      setDbError(data.dbError);
      setSyncError(`Ошибка Turso: ${data.dbError}`);
      return;
    }

    setDbError('');
    setServerRole(data.role ?? null);
    const serverProducts = data.products || [];
    setProducts(serverProducts);
    setInfoItems(data.infoItems || []);
    if (data.settings) setSettings(data.settings);
    setHasPromosServer(Boolean(data.hasPromos));
    setCart((prevCart) => {
      if (prevCart.length === 0) return prevCart;
      const { nextCart, removedNames, priceUpdated } = reconcileCartWithProducts(
        prevCart,
        serverProducts
      );
      if (removedNames.length > 0) {
        setCartNotice(
          `Сняты с продажи и убраны из корзины: ${removedNames.join(', ')}`
        );
      } else if (priceUpdated) {
        setCartNotice('Цены товаров в корзине обновлены по актуальному каталогу.');
      }
      return nextCart;
    });
    if (Array.isArray(data.adminOrders)) {
      setOrders(data.adminOrders);
      setPromos(data.promos || []);
    } else {
      setOrders(data.myOrders || []);
      setPromos([]);
    }
  }, []);

  useEffect(() => {
    initTelegramApp();
    syncCatalogFromServer(true);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        syncCatalogFromServer(false);
      }
    };

    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('focus', handleFocusOrVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('focus', handleFocusOrVisible);
      if (cartToastTimerRef.current) clearTimeout(cartToastTimerRef.current);
    };
  }, [syncCatalogFromServer]);

  // Protect admin tab if role drops to buyer
  useEffect(() => {
    if (activeTab === 'admin' && role === ROLES.USER) {
      setActiveTab('catalog');
    }
  }, [activeTab, role]);

  // Persist changes to localStorage only after server check confirms Turso DB is not configured
  useEffect(() => {
    if (
      bootstrapDone &&
      !dbConfigured &&
      (localStorage.getItem('scredtres_products_v2') !== null || products !== SEED_PRODUCTS)
    ) {
      store.saveProducts(products);
      setLocalSavedProducts(products);
    }
  }, [products, dbConfigured, bootstrapDone]);

  useEffect(() => {
    if (bootstrapDone && !dbConfigured) store.saveInfoItems(infoItems);
  }, [infoItems, dbConfigured, bootstrapDone]);

  useEffect(() => {
    if (bootstrapDone && !dbConfigured) store.saveOrders(orders);
  }, [orders, dbConfigured, bootstrapDone]);

  useEffect(() => {
    if (bootstrapDone && !dbConfigured) store.savePromos(promos);
  }, [promos, dbConfigured, bootstrapDone]);

  useEffect(() => {
    if (bootstrapDone && !dbConfigured) store.saveSettings(settings);
  }, [settings, dbConfigured, bootstrapDone]);

  useEffect(() => {
    store.saveCart(cart);
  }, [cart]);

  useEffect(() => {
    store.saveFavorites(favorites);
  }, [favorites]);

  // Dynamic Telegram closing confirmation when cart has items or checkout is active
  useEffect(() => {
    setClosingConfirmation(cart.length > 0 || checkoutOpen);
  }, [cart.length, checkoutOpen]);

  // Navigate cleanly to the main store catalog screen
  const handleGoHome = useCallback(() => {
    setCheckoutOpen(false);
    setCartOpen(false);
    setSelectedProduct(null);
    setSearchOpen(false);
    setActiveTab('catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Telegram native BackButton handling for overlays & tabs
  const handleNativeBack = useCallback(() => {
    if (checkoutOpen) {
      setCheckoutOpen(false);
      return;
    }
    if (cartOpen) {
      setCartOpen(false);
      return;
    }
    if (selectedProduct) {
      setSelectedProduct(null);
      return;
    }
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    if (activeTab !== 'catalog') {
      setActiveTab('catalog');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [checkoutOpen, cartOpen, selectedProduct, searchOpen, activeTab]);

  useEffect(() => {
    const shouldShowBack =
      checkoutOpen || cartOpen || Boolean(selectedProduct) || searchOpen || activeTab !== 'catalog';
    setBackButton(shouldShowBack, handleNativeBack);
    return () => {
      setBackButton(false, handleNativeBack);
    };
  }, [checkoutOpen, cartOpen, selectedProduct, searchOpen, activeTab, handleNativeBack]);

  // Lock background scroll when modal/drawer is open
  useEffect(() => {
    const isLocked = Boolean(selectedProduct || cartOpen || checkoutOpen);
    document.body.style.overflow = isLocked ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedProduct, cartOpen, checkoutOpen]);

  // Filtered & sorted catalog list
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const min = minPrice !== '' ? Number(minPrice) : null;
    const max = maxPrice !== '' ? Number(maxPrice) : null;

    const list = products.filter((p) => {
      if (activeCategory !== 'all' && p.category !== activeCategory) return false;
      if (availabilityFilter !== 'all' && p.availability !== availabilityFilter) return false;

      if (query) {
        const hay = `${p.name || ''} ${p.brand || ''} ${p.description || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }

      if (min !== null && !Number.isNaN(min) && Number(p.price) < min) return false;
      if (max !== null && !Number.isNaN(max) && Number(p.price) > max) return false;

      return true;
    });

    const sorted = [...list];
    if (sortBy === 'price-asc') {
      sorted.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === 'price-desc') {
      sorted.sort((a, b) => Number(b.price) - Number(a.price));
    } else {
      sorted.sort((a, b) => {
        const da = Date.parse(a.createdAt || '');
        const db = Date.parse(b.createdAt || '');
        return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
      });
    }

    return sorted;
  }, [products, activeCategory, availabilityFilter, searchQuery, sortBy, minPrice, maxPrice]);

  const handleResetFilters = () => {
    setActiveCategory('all');
    setAvailabilityFilter('all');
    setSearchQuery('');
    setSortBy('newest');
    setMinPrice('');
    setMaxPrice('');
  };

  const scrollToCatalog = () => {
    if (activeTab !== 'catalog') {
      setActiveTab('catalog');
    }
    setTimeout(() => {
      catalogRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  // Cart Actions (stored strictly as { product, size, quantity })
  const handleAddToCart = useCallback((product, size, quantity = 1) => {
    const chosenSize = size || product.sizes?.[0] || 'ONE SIZE';
    const addQty = Math.max(1, Math.min(99, Number(quantity) || 1));
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product.id === product.id && item.size === chosenSize
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          product,
          quantity: Math.min(99, updated[existingIndex].quantity + addQty)
        };
        return updated;
      }
      return [...prev, { product, size: chosenSize, quantity: addQty }];
    });

    setCartToast({ name: product.name, size: chosenSize });
    if (cartToastTimerRef.current) clearTimeout(cartToastTimerRef.current);
    cartToastTimerRef.current = setTimeout(() => setCartToast(null), 3200);
  }, []);

  const handleQuickAddCard = useCallback(
    (product, size) => handleAddToCart(product, size, 1),
    [handleAddToCart]
  );

  const handleUpdateCartQuantity = (productId, size, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveCartItem(productId, size);
      return;
    }
    const clamped = Math.min(99, Math.max(1, Math.floor(Number(newQuantity) || 1)));
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId && item.size === size
          ? { ...item, quantity: clamped }
          : item
      )
    );
  };

  const handleRemoveCartItem = (productId, size) => {
    setCart((prev) =>
      prev.filter((item) => !(item.product.id === productId && item.size === size))
    );
  };

  // Favorites Actions
  const handleToggleFavorite = useCallback((productId) => {
    setFavorites((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  // Progressive catalog batching so initial mount & mobile scroll stay smooth
  useEffect(() => {
    setVisibleCount(CATALOG_PAGE_SIZE);
  }, [activeCategory, availabilityFilter, searchQuery, sortBy, minPrice, maxPrice]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );

  useEffect(() => {
    if (activeTab !== 'catalog' || visibleCount >= filteredProducts.length) return;
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((prev) =>
            Math.min(filteredProducts.length, prev + CATALOG_PAGE_SIZE)
          );
        }
      },
      { rootMargin: '700px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, visibleCount, filteredProducts.length]);

  // Reactive order summary (stays in sync if catalog prices refresh during checkout)
  const liveCheckoutSummary = useMemo(() => {
    if (cart.length === 0) return null;
    const freeThreshold = settings?.freeShippingThreshold ?? 15000;
    const stdShipping = settings?.standardShippingCost ?? 490;
    const subtotal = cart.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0);
    const discountAmount = appliedPromo
      ? Math.round((subtotal * Number(appliedPromo.discountPercent || 0)) / 100)
      : 0;
    const shippingCost = subtotal >= freeThreshold ? 0 : stdShipping;
    const total = Math.max(0, subtotal - discountAmount + shippingCost);
    return {
      items: cart,
      subtotal,
      discountAmount,
      shippingCost,
      total,
      appliedPromo
    };
  }, [cart, appliedPromo, settings]);

  // Order Submission
  const handleProceedToCheckout = () => {
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const handleOrderSuccess = (orderRecord) => {
    setOrders((prev) => [orderRecord, ...prev]);
    setCart([]);
    setAppliedPromo(null);
  };

  // Admin / Support CRUD Actions (writes to Turso via /api/admin when configured)
  const runAdminMutation = async (action, payload, applyLocal) => {
    if (!dbConfigured) {
      applyLocal();
      return { ok: true };
    }

    try {
      setSyncError('');
      await sendAdminAction(action, payload);
      applyLocal();
      return { ok: true };
    } catch (err) {
      haptic.error();
      const message = err.message || 'Ошибка синхронизации с базой данных';
      setSyncError(message);
      return { ok: false, error: message };
    }
  };

  const seedById = useMemo(() => new Map(SEED_PRODUCTS.map((p) => [p.id, p])), []);

  const localUnsyncedProducts = useMemo(() => {
    if (!dbConfigured || dbError || !Array.isArray(localSavedProducts) || localSavedProducts.length === 0) {
      return [];
    }
    const serverById = new Map(products.map((p) => [p.id, p]));
    return localSavedProducts.filter((lp) => {
      if (!lp?.id || !lp?.name) return false;
      const serverMatch = serverById.get(lp.id);
      if (serverMatch && sameProductSnapshot(lp, serverMatch)) return false;
      const seedMatch = seedById.get(lp.id);
      if (seedMatch && sameProductSnapshot(lp, seedMatch)) return false;
      return true;
    });
  }, [dbConfigured, dbError, localSavedProducts, products, seedById]);

  useEffect(() => {
    if (
      dbConfigured &&
      !dbError &&
      !isSyncingLocal &&
      Array.isArray(localSavedProducts) &&
      localSavedProducts.length > 0 &&
      localUnsyncedProducts.length === 0
    ) {
      store.clearProducts();
      setLocalSavedProducts([]);
    }
  }, [dbConfigured, dbError, isSyncingLocal, localSavedProducts, localUnsyncedProducts.length]);

  const handleSyncLocalToTurso = async () => {
    if (!dbConfigured || isSyncingLocal || localUnsyncedProducts.length === 0) return;
    setIsSyncingLocal(true);
    setSyncError('');
    setLocalSyncNotice('');
    try {
      const BATCH_SIZE = 30;
      let totalSynced = 0;
      let totalSkipped = 0;
      const queue = [...localUnsyncedProducts];

      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const chunk = queue.slice(i, i + BATCH_SIZE);
        setLocalSyncNotice(`Перенос ${Math.min(i + chunk.length, queue.length)} из ${queue.length}...`);
        const res = await sendAdminAction('sync_products', { products: chunk });
        totalSynced += Number(res?.syncedCount) || chunk.length;
        totalSkipped += Number(res?.skippedCount) || 0;
      }

      store.clearProducts();
      setLocalSavedProducts([]);
      await syncCatalogFromServer(true);
      haptic.success();
      setLocalSyncNotice(
        totalSkipped > 0
          ? `Перенесено: ${totalSynced} шт. (пропущено некорректных: ${totalSkipped})`
          : `Перенесено в Turso: ${totalSynced} шт.`
      );
    } catch (err) {
      haptic.error();
      const message = err.message || 'Не удалось перенести локальные товары';
      setSyncError(message);
      setLocalSyncNotice(`Ошибка: ${message}`);
    } finally {
      setIsSyncingLocal(false);
    }
  };

  const handleSaveProduct = (savedProduct) =>
    runAdminMutation('save_product', savedProduct, () => {
      setProducts((prev) => {
        const exists = prev.some((p) => p.id === savedProduct.id);
        if (exists) {
          return prev.map((p) => (p.id === savedProduct.id ? savedProduct : p));
        }
        return [savedProduct, ...prev];
      });
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === savedProduct.id ? { ...item, product: savedProduct } : item
        )
      );
    });

  const handleDeleteProduct = (productId) =>
    runAdminMutation('delete_product', { productId }, () => {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setFavorites((prev) => prev.filter((id) => id !== productId));
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
    });

  const handleSaveInfoItem = (item) =>
    runAdminMutation('save_info', item, () => {
      setInfoItems((prev) => {
        const exists = prev.some((i) => i.id === item.id);
        if (exists) {
          return prev.map((i) => (i.id === item.id ? item : i));
        }
        return [item, ...prev];
      });
    });

  const handleDeleteInfoItem = (itemId) =>
    runAdminMutation('delete_info', { itemId }, () => {
      setInfoItems((prev) => prev.filter((i) => i.id !== itemId));
    });

  const handleUpdateOrder = (orderId, patch) =>
    runAdminMutation('update_order', { orderId, patch }, () => {
      setOrders((prev) =>
        prev.map((o) => (o.orderId === orderId ? { ...o, ...patch } : o))
      );
    });

  const handleDeleteOrder = (orderId) =>
    runAdminMutation('delete_order', { orderId }, () => {
      setOrders((prev) => prev.filter((o) => o.orderId !== orderId));
    });

  const handleAddPromo = (promo) =>
    runAdminMutation('add_promo', promo, () => {
      setHasPromosServer(true);
      setPromos((prev) => {
        const filtered = prev.filter((p) => p.code !== promo.code);
        return [promo, ...filtered];
      });
    });

  const handleDeletePromo = (code) =>
    runAdminMutation('delete_promo', { code }, () => {
      setPromos((prev) => {
        const next = prev.filter((p) => p.code !== code);
        setHasPromosServer(next.length > 0);
        return next;
      });
    });

  const handleSaveSettings = (nextSettings) =>
    runAdminMutation('save_settings', nextSettings, () => {
      setSettings(nextSettings);
    });

  const handleImportBackup = (backup) =>
    runAdminMutation('import_backup', backup, () => {
      if (Array.isArray(backup.products)) setProducts(backup.products);
      if (Array.isArray(backup.infoItems)) setInfoItems(backup.infoItems);
      if (Array.isArray(backup.orders)) setOrders(backup.orders);
      if (Array.isArray(backup.promos)) {
        setPromos(backup.promos);
        setHasPromosServer(backup.promos.length > 0);
      }
      if (backup.settings && typeof backup.settings === 'object') {
        setSettings((prev) => ({ ...prev, ...backup.settings }));
      }
    });

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-montserrat selection:bg-white selection:text-black">
      {/* Header + Slide-down Search Drawer */}
      <Header
        cartCount={cartCount}
        favoritesCount={favorites.length}
        onOpenCart={() => {
          setCartToast(null);
          setCartOpen(true);
        }}
        onOpenFavorites={() => {
          setSearchOpen(false);
          setActiveTab('favorites');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onToggleSearch={() => {
          if (activeTab !== 'catalog') {
            setActiveTab('catalog');
          }
          setSearchOpen((prev) => !prev);
        }}
        searchOpen={searchOpen}
        onGoHome={handleGoHome}
      />

      <SearchBar
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        availabilityFilter={availabilityFilter}
        onAvailabilityChange={setAvailabilityFilter}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        sortBy={sortBy}
        onSortChange={setSortBy}
        minPrice={minPrice}
        onMinPriceChange={setMinPrice}
        maxPrice={maxPrice}
        onMaxPriceChange={setMaxPrice}
        onResetFilters={handleResetFilters}
        totalResults={filteredProducts.length}
        onApplyAndScroll={scrollToCatalog}
      />

      {/* Main Content */}
      <main className="flex-1 pb-20">
        {syncError && (
          <div className="max-w-4xl mx-auto px-4 pt-4">
            <div className="p-3 rounded-xl border border-white bg-[#121212] text-white text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{syncError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSyncError('')}
                className="text-[#888888] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {activeTab === 'catalog' && (
          <>
            <HeroBanner onExploreCatalog={scrollToCatalog} />

            <div ref={catalogRef}>
              <CategoryFilter
                activeCategory={activeCategory}
                onSelectCategory={setActiveCategory}
                availabilityFilter={availabilityFilter}
                onAvailabilityChange={setAvailabilityFilter}
              />
            </div>

            <section className="max-w-6xl mx-auto px-3 sm:px-4 py-5">
              {products.length === 0 ? (
                <div className="max-w-md mx-auto my-8 p-6 sm:p-8 bg-[#080808] border border-[#181818] rounded-2xl text-center space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-full bg-black border border-[#222222] flex items-center justify-center">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-sm font-cinzel font-bold uppercase tracking-wider text-white">
                      Каталог SCREDTRES
                    </h2>
                    <p className="text-xs text-[#888888] leading-relaxed">
                      Каталог обновляется. По вопросам наличия и индивидуального заказа напишите в поддержку.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          haptic.medium();
                          setActiveTab('admin');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Добавить товар</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        haptic.medium();
                        openTelegramLink(`https://t.me/${supportUsername}`);
                      }}
                      className={`w-full sm:w-auto px-5 py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isStaff
                          ? 'border border-[#262626] text-white hover:border-white'
                          : 'bg-white text-black hover:bg-[#dddddd]'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Написать @{supportUsername}</span>
                    </button>
                  </div>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-16 text-center space-y-4 max-w-xs mx-auto">
                  <SearchX className="w-8 h-8 text-[#444444] mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                      Ничего не найдено
                    </h3>
                    <p className="text-xs text-[#777777]">
                      Попробуйте изменить запрос или сбросить фильтры поиска.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic.light();
                      handleResetFilters();
                    }}
                    className="px-5 py-2.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-[#dddddd] transition-colors cursor-pointer"
                  >
                    Сбросить фильтры
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
                    {visibleProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onSelectProduct={setSelectedProduct}
                        isFavorite={favoriteSet.has(product.id)}
                        onToggleFavorite={handleToggleFavorite}
                        onQuickAddToCart={handleQuickAddCard}
                      />
                    ))}
                  </div>

                  {visibleCount < filteredProducts.length && (
                    <div ref={loadMoreRef} className="pt-6 pb-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleCount((prev) =>
                            Math.min(filteredProducts.length, prev + CATALOG_PAGE_SIZE)
                          )
                        }
                        className="px-6 py-2.5 rounded-full bg-[#111111] border border-[#262626] hover:border-white text-xs text-[#cccccc] hover:text-white transition-colors cursor-pointer"
                      >
                        Показать ещё ({filteredProducts.length - visibleCount})
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {activeTab === 'favorites' && (
          <FavoritesView
            favoriteIds={favorites}
            products={products}
            onSelectProduct={setSelectedProduct}
            onToggleFavorite={handleToggleFavorite}
            onAddToCart={handleAddToCart}
            onGoToCatalog={() => setActiveTab('catalog')}
          />
        )}

        {activeTab === 'reviews' && (
          <ReviewsView onGoToCatalog={() => setActiveTab('catalog')} />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            role={role}
            orders={orders}
            infoItems={infoItems}
            settings={settings}
            devRoleOverride={devRoleOverride}
            onChangeDevRole={setDevRoleOverride}
            onOpenAdminPanel={() => {
              syncCatalogFromServer(true);
              setActiveTab('admin');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {activeTab === 'admin' && isStaff && (
          <AdminPanel
            role={role}
            products={products}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
            infoItems={infoItems}
            onSaveInfoItem={handleSaveInfoItem}
            onDeleteInfoItem={handleDeleteInfoItem}
            orders={orders}
            onUpdateOrder={handleUpdateOrder}
            onDeleteOrder={handleDeleteOrder}
            promos={promos}
            onAddPromo={handleAddPromo}
            onDeletePromo={handleDeletePromo}
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onImportBackup={handleImportBackup}
            dbConfigured={dbConfigured}
            dbError={dbError}
            isRefreshing={isRefreshing}
            onRefreshCatalog={() => syncCatalogFromServer(true)}
            localUnsyncedCount={localUnsyncedProducts.length}
            isSyncingLocal={isSyncingLocal}
            localSyncNotice={localSyncNotice}
            onDismissLocalSyncNotice={() => setLocalSyncNotice('')}
            onSyncLocalToTurso={handleSyncLocalToTurso}
            onOpenProduct={setSelectedProduct}
          />
        )}
      </main>

      {showScrollTop && !cartToast && !selectedProduct && !cartOpen && !checkoutOpen && (
        <button
          type="button"
          onClick={() => {
            haptic.light();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          aria-label="Подняться вверх"
          className="fixed bottom-20 right-4 z-30 w-10 h-10 rounded-full bg-[#111111]/95 border border-[#2c2c2c] hover:border-white text-white shadow-xl flex items-center justify-center transition-colors cursor-pointer"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      <Footer onGoHome={handleGoHome} />

      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setSearchOpen(false);
          if (tab === 'cart') {
            setCartToast(null);
            setCartOpen(true);
            return;
          }
          if (tab === 'admin' || tab === 'profile') {
            syncCatalogFromServer(true);
          }
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        cartCount={cartCount}
        favoritesCount={favorites.length}
        role={role}
      />

      {/* Quick Cart Toast */}
      {cartToast && !cartOpen && !checkoutOpen && (
        <div className="fixed bottom-18 sm:bottom-20 left-4 right-4 z-40 max-w-md mx-auto pointer-events-auto">
          <div className="px-3.5 py-2.5 rounded-2xl bg-[#111111]/95 backdrop-blur-md border border-[#2c2c2c] shadow-2xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span className="text-white truncate">
                Добавлено: <span className="font-medium">{cartToast.name}</span>{' '}
                <span className="text-[#888888]">({cartToast.size})</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                haptic.light();
                setCartToast(null);
                setCartOpen(true);
              }}
              className="px-3 py-1.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-[11px] font-semibold uppercase tracking-wider shrink-0 inline-flex items-center gap-1 cursor-pointer"
            >
              <ShoppingBag className="w-3 h-3" />
              <span>Корзина</span>
            </button>
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
          isFavorite={favorites.includes(selectedProduct.id)}
          onToggleFavorite={handleToggleFavorite}
          supportUsername={supportUsername}
        />
      )}

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        promos={promos}
        appliedPromo={appliedPromo}
        onAppliedPromoChange={setAppliedPromo}
        hasPromos={hasPromosServer}
        dbConfigured={dbConfigured}
        isBrowserGuest={isBrowserGuest}
        cartNotice={cartNotice}
        onDismissCartNotice={() => setCartNotice('')}
        settings={settings}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={handleProceedToCheckout}
      />

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        orderSummary={liveCheckoutSummary}
        supportUsername={supportUsername}
        dbConfigured={dbConfigured}
        isBrowserGuest={isBrowserGuest}
        devRoleOverride={devRoleOverride}
        onOrderSuccess={handleOrderSuccess}
      />
    </div>
  );
}
