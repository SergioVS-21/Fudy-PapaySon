import { Injectable, computed, inject, signal } from '@angular/core';
import { onIdTokenChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
import { FirebaseDataService } from './firebase-data.service';
import { authDb } from './firebase.config';
import { DolarService } from '../services/dolar';
import {
  AppSettingsDoc,
  CustomerDoc,
  InventoryArticleDoc,
  InventoryMovementDoc,
  OrderDoc,
  OrderItemDoc,
  PrintJobDoc,
  ProductDoc,
  ProductCategoryDoc,
  UserDoc
} from './firebase-models';
import { INITIAL_PRODUCTS, INITIAL_USERS, RESTAURANTS } from './seed-data';
import { formatTableNumberLabel } from './table-layouts';
import {
  AppSettings,
  AppUser,
  AreaId,
  Customer,
  InventoryArticle,
  InventoryMeasureUnit,
  Order,
  OrderCounterKey,
  OrderSource,
  PaymentMethod,
  PaymentVerificationStatus,
  ProductBaseCategory,
  Product,
  ProductCategoryInfo,
  RestaurantId,
  SalesReport,
  UserRole
} from './models';

type DraftItem = { productId: string; quantity: number; note?: string };
type PaymentCapture = {
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentAmountUsd?: number;
  paymentAmountBs?: number;
};
type ConsumptionPrintJobInput = Omit<PrintJobDoc, 'id' | 'type' | 'area' | 'createdAt'>;
type SignInResult = 'success' | 'invalid_credentials' | 'network_error';
type SyncOverlayStatus = 'idle' | 'uploading' | 'completed' | 'error';
type PaymentVerificationNotification = {
  orderId: string;
  title: string;
  message: string;
};
const SESSION_STORAGE_KEY = 'soulfudy.session.user';
const PAYMENT_VERIFICATION_ACK_STORAGE_KEY = 'soulfudy.paymentVerification.ack';
const BACKGROUND_REFRESH_INTERVAL_MS = 15000;
const BCV_AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BCV_AUTO_SYNC_DEBOUNCE_MS = 5 * 60 * 1000;
const BCV_AUTO_SYNC_STORAGE_KEY = 'soulfudy.bcv.last-sync-day';
const AUTH_SESSION_REVALIDATION_MS = 60_000;
const NETWORK_OPERATION_TIMEOUT_MS = 30_000;
const SYNC_OVERLAY_AUTOHIDE_MS = 1400;
const GENERAL_APP_SETTINGS_ID = 'GENERAL';
const DEFAULT_ADMIN_PIN = '1234';
const DEFAULT_APP_SETTINGS: AppSettings = {
  id: GENERAL_APP_SETTINGS_ID,
  defaultTipPercent: 0,
  bcvRate: 0,
  orderCounters: {},
  adminSecurityPin: DEFAULT_ADMIN_PIN
};

@Injectable({ providedIn: 'root' })
export class AppStateService {
  private readonly firebaseData = inject(FirebaseDataService);
  private readonly dolarService = inject(DolarService);
  private backgroundRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private backgroundRefreshPromise: Promise<void> | null = null;
  private bcvAutoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private bcvAutoSyncPromise: Promise<void> | null = null;
  private lastBcvAutoSyncAttemptAt = 0;
  private pendingSyncOperations = 0;
  private syncOverlayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private syncOverlayRetryOperation: (() => Promise<unknown>) | null = null;
  private lastAuthValidationAt = 0;
  private authInitializationResolved = false;
  private resolveAuthInitialization: (() => void) | null = null;
  private readonly authInitializationPromise = new Promise<void>((resolve) => {
    this.resolveAuthInitialization = resolve;
  });
  readonly restaurants = signal(RESTAURANTS);
  readonly appSettings = signal<AppSettings>(DEFAULT_APP_SETTINGS);
  readonly users = signal<AppUser[]>([]);
  readonly currentUser = signal<AppUser | null>(null);
  readonly customers = signal<Customer[]>([]);
  readonly products = signal<Product[]>(INITIAL_PRODUCTS);
  readonly inventoryArticles = signal<InventoryArticle[]>([]);
  readonly productCategories = signal<ProductCategoryInfo[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly syncOverlayVisible = signal(false);
  readonly syncOverlayStatus = signal<SyncOverlayStatus>('idle');
  readonly syncOverlayMessage = signal('');
  readonly syncOverlayCanRetry = signal(false);
  readonly runtimeDataLoading = signal(false);
  readonly runtimeDataError = signal('');
  readonly createOrderError = signal('');
  readonly paymentVerificationNotifications = signal<PaymentVerificationNotification[]>([]);
  readonly activePaymentVerificationNotification = computed(
    () => this.paymentVerificationNotifications()[0] ?? null
  );

  readonly currentUserId = computed(() => this.currentUser()?.id ?? 'ANON-USER');
  readonly currentUserRole = computed<UserRole | null>(() => this.currentUser()?.role ?? null);
  readonly allowedRestaurantIds = computed<RestaurantId[]>(() => this.currentUser()?.restaurantIds ?? []);
  readonly isAdmin = computed(() => this.currentUserRole() === 'ADMIN');
  readonly isOperations = computed(() => this.currentUserRole() === 'OPERACIONES');
  readonly isMesonero = computed(() => this.currentUserRole() === 'MESONERO');
  readonly isRunner = computed(() => this.currentUserRole() === 'RUNNER');
  readonly isCaja = computed(() => this.currentUserRole() === 'CAJA');

  readonly lowStockProducts = computed(() =>
    this.products().filter((product) => product.stock <= 2 || !product.available)
  );

  readonly pendingOrders = computed(() =>
    this.orders().filter((order) => ['PENDIENTE', 'EN_PROCESO'].includes(order.status))
  );

  constructor() {
    this.watchFirebaseAuthSession();
    this.restoreSessionFromStorage();
    if (authDb.currentUser || this.currentUser()) {
      this.startBcvAutoSync();
      void this.loadUsersFromFirebase();
      void this.refreshRuntimeDataFromFirebase({ showLoading: true });
      void this.syncBcvRateFromApi();
    }
    void this.ensureAuthSessionActive();
  }

  startBackgroundRefresh(): void {
    if (typeof window === 'undefined' || this.backgroundRefreshTimer) {
      return;
    }

    const runRefresh = () => {
      if (!this.currentUser()) {
        return;
      }

      void this.refreshRuntimeDataFromFirebase();
    };

    runRefresh();
    this.backgroundRefreshTimer = setInterval(runRefresh, BACKGROUND_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', runRefresh);
    window.addEventListener('online', runRefresh);
  }

  async refreshRuntimeDataFromFirebase(options?: { showLoading?: boolean }): Promise<void> {
    if (this.backgroundRefreshPromise) {
      return this.backgroundRefreshPromise;
    }

    const showLoading = options?.showLoading ?? false;
    if (showLoading) {
      this.runtimeDataLoading.set(true);
      this.runtimeDataError.set('');
    }

    if (this.currentUser()) {
      const isAuthSessionValid = await this.ensureAuthSessionActive();
      if (!isAuthSessionValid) {
        if (showLoading) {
          this.runtimeDataLoading.set(false);
        }
        return;
      }
    }

    this.backgroundRefreshPromise = Promise.all([
      this.loadAppSettingsFromFirebase(),
      this.loadCustomersFromFirebase(),
      this.loadProductsFromFirebase(),
      this.loadInventoryArticlesFromFirebase(),
      this.loadOrdersFromFirebase(),
      this.loadProductCategoriesFromFirebase()
    ])
      .then(() => {
        this.ensureAllProductCategoriesExist();
      })
      .finally(() => {
        if (showLoading) {
          this.runtimeDataLoading.set(false);
        }
      })
      .finally(() => {
        this.backgroundRefreshPromise = null;
      });

    return this.backgroundRefreshPromise;
  }

  retryRuntimeDataLoad(): Promise<void> {
    return this.refreshRuntimeDataFromFirebase({ showLoading: true });
  }

  async refreshOrdersFromFirebase(): Promise<void> {
    await this.loadOrdersFromFirebase();
  }

  validateAdminSecurityPin(pin: string): boolean {
    if (!pin) {
      return false;
    }
    const currentPin = this.appSettings()?.adminSecurityPin || DEFAULT_ADMIN_PIN;
    return pin.trim() === currentPin.trim();
  }

  updateAppSettings(input: { defaultTipPercent: number; bcvRate: number; adminSecurityPin?: string }): void {
    if (!this.isAdmin()) {
      return;
    }

    const current = this.appSettings();
    const now = new Date().toISOString();
    const nextSettings: AppSettings = {
      ...current,
      defaultTipPercent: this.normalizeTipPercent(input.defaultTipPercent),
      bcvRate: this.normalizeBcvRate(input.bcvRate),
      adminSecurityPin: input.adminSecurityPin?.trim() || current.adminSecurityPin || DEFAULT_ADMIN_PIN,
      createdAt: current.createdAt ?? now,
      updatedAt: now
    };

    this.appSettings.set(nextSettings);
    this.trackSyncOperation(
      () => this.firebaseData.saveAppSettings(this.mapAppSettingsToDoc(nextSettings)),
      'Ajustes de caja guardados',
      'No fue posible guardar la propina y la tasa BCV.'
    );
  }

  retrySyncOperation(): void {
    const operation = this.syncOverlayRetryOperation;
    this.syncOverlayRetryOperation = null;
    this.syncOverlayCanRetry.set(false);

    if (!operation) {
      void this.retryRuntimeDataLoad();
      return;
    }

    this.trackSyncOperation(operation, 'Sincronizacion completada', 'No se pudo completar la carga');
  }

  cancelSyncOperation(): void {
    if (this.syncOverlayTimeoutId) {
      clearTimeout(this.syncOverlayTimeoutId);
      this.syncOverlayTimeoutId = null;
    }
    this.pendingSyncOperations = 0;
    this.syncOverlayVisible.set(false);
    this.syncOverlayStatus.set('idle');
    this.syncOverlayMessage.set('');
    this.syncOverlayCanRetry.set(false);
    this.syncOverlayRetryOperation = null;
  }

  clearRuntimeDataError(): void {
    this.runtimeDataError.set('');
    this.runtimeDataLoading.set(false);
  }

  queueConsumptionPrintJob(input: ConsumptionPrintJobInput): void {
    const createdAt = new Date().toISOString();
    const printJob: PrintJobDoc = {
      id: `PRINT-${crypto.randomUUID().replace(/-/g, '').substring(0, 10).toUpperCase()}`,
      type: 'NOTA_CONSUMO',
      area: 'CAJA',
      createdAt,
      ...input
    };

    this.trackSyncOperation(
      () => this.firebaseData.savePrintJob(printJob),
      'Nota enviada a impresion',
      'No fue posible enviar la nota de consumo a impresion.',
      { silent: true }
    );
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      return 'invalid_credentials';
    }

    try {
      await signInWithEmailAndPassword(authDb, normalizedEmail, normalizedPassword);
    } catch (error) {
      const authCode =
        typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
          ? error.code
          : '';

      if (
        authCode === 'auth/wrong-password' ||
        authCode === 'auth/user-not-found' ||
        authCode === 'auth/invalid-credential' ||
        authCode === 'auth/invalid-email'
      ) {
        return 'invalid_credentials';
      }

      return 'network_error';
    }

    const usersLoaded = await this.loadUsersFromFirebase();
    if (!usersLoaded) {
      return 'network_error';
    }

    let user = this.users().find(
      (item) => item.email.toLowerCase() === normalizedEmail && item.isActive
    );

    if (!user) {
      const now = new Date().toISOString();
      const newUser: AppUser = {
        id: `USR-ADMIN-${Date.now()}`,
        email: normalizedEmail,
        displayName: normalizedEmail.split('@')[0] || 'Admin User',
        role: 'ADMIN',
        restaurantIds: ['PAPA_Y_SON'],
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      try {
        await this.firebaseData.saveUser({
          id: newUser.id,
          email: newUser.email,
          displayName: newUser.displayName,
          role: newUser.role,
          restaurantIds: newUser.restaurantIds,
          isActive: true,
          createdAt: now,
          updatedAt: now
        });
        this.users.update((list) => [...list, newUser]);
        user = newUser;
      } catch (err) {
        console.error('Error auto-creating admin user doc:', err);
      }
    }

    if (!user) {
      void firebaseSignOut(authDb).catch(() => undefined);
      return 'invalid_credentials';
    }

    this.currentUser.set(user);
    this.persistSession(user);
    void this.refreshRuntimeDataFromFirebase({ showLoading: true });
    return 'success';
  }

  signOut(): void {
    this.currentUser.set(null);
    this.paymentVerificationNotifications.set([]);
    this.clearSession();
    void firebaseSignOut(authDb).catch(() => undefined);
  }

  canAccessModule(module: 'dashboard' | 'comandas' | 'operacion' | 'inventario' | 'reportes' | 'qr'): boolean {
    const role = this.currentUserRole();
    if (!role) {
      return module === 'qr';
    }

    if (role === 'ADMIN') {
      return true;
    }

    if (role === 'CAJA') {
      if (this.isPapaAndSonCashierUser()) {
        return module === 'dashboard';
      }

      return module !== 'inventario' && module !== 'qr';
    }

    if (role === 'OPERACIONES') {
      return module === 'operacion';
    }

    if (role === 'RUNNER') {
      return module === 'operacion' || module === 'comandas';
    }

    if (role === 'MESONERO') {
      return module === 'comandas';
    }

    return false;
  }

  private isPapaAndSonCashierUser(): boolean {
    return this.currentUserRole() === 'CAJA' && this.allowedRestaurantIds().length === 1 && this.allowedRestaurantIds()[0] === 'PAPA_Y_SON';
  }

  orderMatchesCurrentRestaurants(order: Order): boolean {
    const allowed = this.allowedRestaurantIds();
    if (!allowed.length) {
      return false;
    }

    return order.items.some((item) => allowed.includes(item.restaurantId));
  }

  getVisibleOrdersForModule(module: 'dashboard' | 'comandas' | 'operacion' | 'inventario' | 'reportes'): Order[] {
    const role = this.currentUserRole();
    if (!role) {
      return [];
    }

    const allOrders = this.orders();
    if (role === 'ADMIN') {
      return allOrders.filter((order) => this.orderMatchesCurrentRestaurants(order));
    }

    if (role === 'CAJA') {
      if (module === 'inventario') {
        return [];
      }

      return allOrders.filter((order) => this.orderMatchesCurrentRestaurants(order));
    }

    if (role === 'OPERACIONES') {
      if (module !== 'operacion') {
        return [];
      }

      return allOrders.filter((order) => this.orderMatchesCurrentRestaurants(order));
    }

    if (role === 'RUNNER') {
      if (module === 'operacion') {
        return allOrders.filter((order) => this.orderMatchesCurrentRestaurants(order));
      }
      if (module !== 'comandas') {
        return [];
      }

      const currentId = this.currentUserId();
      return allOrders.filter(
        (order) => order.createdByUserId === currentId && this.orderMatchesCurrentRestaurants(order)
      );
    }

    if (role === 'MESONERO') {
      if (module === 'operacion') {
        return allOrders.filter((order) => this.orderMatchesCurrentRestaurants(order));
      }
      if (module !== 'comandas') {
        return [];
      }

      const currentId = this.currentUserId();
      return allOrders.filter(
        (order) => order.createdByUserId === currentId && this.orderMatchesCurrentRestaurants(order)
      );
    }

    return [];
  }

  getVisibleProducts(): Product[] {
    const role = this.currentUserRole();
    if (!role) {
      return [];
    }

    const allowed = this.allowedRestaurantIds();
    if (!allowed.length) {
      return [];
    }

    return this.products().filter((product) => allowed.includes(product.restaurantId));
  }

  getVisibleInventoryArticles(): InventoryArticle[] {
    const role = this.currentUserRole();
    if (!role) {
      return [];
    }

    const allowed = this.allowedRestaurantIds();
    if (!allowed.length) {
      return [];
    }

    return this.inventoryArticles().filter((article) => allowed.includes(article.restaurantId));
  }

  getVisibleProductsForComandas(): Product[] {
    const role = this.currentUserRole();
    if (!role) {
      return [];
    }
    return this.getVisibleProducts();
  }

  getUserDisplayName(userId?: string): string {
    if (!userId) {
      return 'Sistema';
    }

    return this.users().find((user) => user.id === userId)?.displayName ?? userId;
  }

  async createOrder(
    tableNumber: number,
    clientDocumentId: string,
    clientName: string,
    source: OrderSource,
    draftItems: DraftItem[]
  ): Promise<Order | null> {
    this.createOrderError.set('');
    const normalizedDocumentId = this.normalizeClientDocumentId(clientDocumentId);
    const normalizedItems = draftItems.filter((item) => item.quantity > 0);
    const allowedRestaurants = this.allowedRestaurantIds();
    const enforceRestaurantScope = allowedRestaurants.length > 0;
    if (!normalizedItems.length || !normalizedDocumentId) {
      return null;
    }

    const currentProducts = this.products();
    const items = this.buildOrderItemsFromDrafts(
      normalizedItems,
      currentProducts,
      enforceRestaurantScope,
      allowedRestaurants
    );

    if (!items.length) {
      return null;
    }

    const now = new Date().toISOString();
    const orderCounterConfig = this.getOrderCounterConfig(items);
    let reservedOrder: { orderId: string; nextOrderNumber: number };
    try {
      reservedOrder = await this.firebaseData.reserveNextOrderId({
        settingsId: GENERAL_APP_SETTINGS_ID,
        counterKey: orderCounterConfig.counterKey,
        prefix: orderCounterConfig.prefix
      });
    } catch (error) {
      const errorMessage = error instanceof Error && error.message.includes('ya existe')
        ? 'Conflicto de numeracion. Por favor reintenta.'
        : `Error al crear comanda: ${error instanceof Error ? error.message : String(error)}`;
      console.error('No fue posible reservar el consecutivo de la comanda.', error);
      this.createOrderError.set(errorMessage);
      this.syncOverlayVisible.set(true);
      this.syncOverlayStatus.set('error');
      this.syncOverlayMessage.set(errorMessage);
      this.syncOverlayCanRetry.set(true);
      this.syncOverlayRetryOperation = () => this.retryRuntimeDataLoad();
      return null;
    }

    this.appSettings.update((settings) => ({
      ...settings,
      id: settings.id || GENERAL_APP_SETTINGS_ID,
      orderCounters: {
        ...settings.orderCounters,
        [orderCounterConfig.counterKey]: reservedOrder.nextOrderNumber
      },
      createdAt: settings.createdAt ?? now,
      updatedAt: now
    }));

    const soldQuantities = this.getSoldQuantitiesByProduct(items, currentProducts);
    this.products.update((products) =>
      products.map((product) => {
        const soldQuantity = soldQuantities.get(product.id) ?? 0;
        if (soldQuantity <= 0) {
          return product;
        }

        const isPapaYSon = product.restaurantId === 'PAPA_Y_SON';
        return {
          ...product,
          stock: isPapaYSon ? product.stock - soldQuantity : Math.max(product.stock - soldQuantity, 0),
          available: isPapaYSon ? product.available : (product.stock - soldQuantity > 0 ? product.available : false),
          updatedAt: now
        };
      })
    );
    this.applyInventoryArticleDiscounts(this.toProductQuantityEntries(soldQuantities), now);

    const order: Order = {
      id: reservedOrder.orderId,
      tableNumber,
      clientDocumentId: normalizedDocumentId,
      clientName: this.normalizeClientName(clientName),
      source,
      createdByUserId: source === 'MESONERO' ? this.currentUserId() : 'QR',
      status: 'PENDIENTE',
      createdAt: now,
      updatedAt: now,
      items: items.map((item) => ({
        ...item,
        createdAt: now,
        updatedAt: now
      }))
    };

    this.orders.update((orders) => [order, ...orders]);
    this.upsertCustomer(normalizedDocumentId, order.clientName, now);
    this.syncNewOrder(order);
    this.syncTouchedProducts([...soldQuantities.keys()]);
    this.syncTouchedInventoryArticles([...soldQuantities.keys()]);
    return order;
  }

  appendItemsToOrder(orderId: string, draftItems: DraftItem[]): Order | null {
    const order = this.orders().find((item) => item.id === orderId);
    if (!order || order.status === 'COBRADO') {
      return null;
    }

    const normalizedItems = draftItems.filter((item) => item.quantity > 0);
    const allowedRestaurants = this.allowedRestaurantIds();
    const enforceRestaurantScope = allowedRestaurants.length > 0;
    if (!normalizedItems.length) {
      return null;
    }

    const currentProducts = this.products();
    const items = this.buildOrderItemsFromDrafts(
      normalizedItems,
      currentProducts,
      enforceRestaurantScope,
      allowedRestaurants
    );

    if (!items.length) {
      return null;
    }

    const now = new Date().toISOString();

    const soldQuantities = this.getSoldQuantitiesByProduct(items, currentProducts);
    this.products.update((products) =>
      products.map((product) => {
        const soldQuantity = soldQuantities.get(product.id) ?? 0;
        if (soldQuantity <= 0) {
          return product;
        }

        const isPapaYSon = product.restaurantId === 'PAPA_Y_SON';
        return {
          ...product,
          stock: isPapaYSon ? product.stock - soldQuantity : Math.max(product.stock - soldQuantity, 0),
          available: isPapaYSon ? product.available : (product.stock - soldQuantity > 0 ? product.available : false),
          updatedAt: now
        };
      })
    );

    this.orders.update((orders) =>
      orders.map((existingOrder) => {
        if (existingOrder.id !== orderId) {
          return existingOrder;
        }

        return {
          ...existingOrder,
          status:
            existingOrder.status === 'LISTO' || existingOrder.status === 'ENTREGADO'
              ? 'PENDIENTE'
              : existingOrder.status,
          updatedAt: now,
          items: [
            ...existingOrder.items,
            ...items.map((item) => ({
              ...item,
              createdAt: now,
              updatedAt: now
            }))
          ]
        };
      })
    );
    this.applyInventoryArticleDiscounts(this.toProductQuantityEntries(soldQuantities), now);

    this.syncOrderById(orderId);
    this.syncTouchedProducts([...soldQuantities.keys()]);
    this.syncTouchedInventoryArticles([...soldQuantities.keys()]);
    return this.orders().find((item) => item.id === orderId) ?? null;
  }

  getCustomerNameByDocumentId(documentId: string): string | null {
    const normalizedDocumentId = this.normalizeClientDocumentId(documentId);
    if (!normalizedDocumentId) {
      return null;
    }

    return this.customers().find((customer) => customer.documentId === normalizedDocumentId)?.name ?? null;
  }

  markItemReady(orderId: string, itemId: string, area: AreaId | 'ALL' = 'ALL'): void {
    const now = new Date().toISOString();
    this.orders.update((orders) =>
      orders.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        const items = order.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          // Si no tiene subItems o area es 'ALL', marcamos el item completo como LISTO.
          if (!item.subItems || item.subItems.length === 0 || area === 'ALL') {
            return {
              ...item,
              status: 'LISTO' as const,
              mainReady: true,
              subItems: item.subItems?.map(sub => ({ ...sub, ready: true })),
              updatedAt: now
            };
          }

          // Si tiene subItems y es una área específica
          const updatedSubItems = item.subItems.map((sub) =>
            sub.area === area ? { ...sub, ready: true } : sub
          );

          // El item combo estará LISTO si todos sus subItems están listos
          const allSubsReady = updatedSubItems.every((sub) => sub.ready);

          return {
            ...item,
            status: (allSubsReady ? 'LISTO' : 'PENDIENTE') as any,
            mainReady: allSubsReady,
            subItems: updatedSubItems,
            updatedAt: now
          };
        });

        const hasPending = items.some((item) => item.status === 'PENDIENTE' || item.status === 'EN_PROCESO');
        return {
          ...order,
          items,
          status: hasPending ? 'EN_PROCESO' : 'LISTO',
          updatedAt: now
        };
      })
    );
    this.syncOrderById(orderId, { silent: true });
  }

  completeOrder(orderId: string, payment?: PaymentCapture): void {
    this.completeOrders([orderId], payment);
  }

  requestPaymentVerification(orderId: string, payment: PaymentCapture): boolean {
    const order = this.orders().find((item) => item.id === orderId);
    const normalizedReference = payment.paymentReference?.trim();
    if (
      !order ||
      order.status !== 'ENTREGADO' ||
      payment.paymentMethod !== 'PAGO_MOVIL' ||
      !normalizedReference
    ) {
      return false;
    }

    const now = new Date().toISOString();
    this.orders.update((orders) =>
      orders.map((item) =>
        item.id === orderId
          ? {
              ...item,
              paymentMethod: payment.paymentMethod,
              paymentReference: normalizedReference,
              paymentAmountUsd: payment.paymentAmountUsd,
              paymentAmountBs: payment.paymentAmountBs,
              paymentVerificationStatus: 'PENDIENTE',
              paymentRequestedAt: now,
              paymentVerifiedAt: undefined,
              paymentVerifiedByUserId: undefined,
              paymentRejectedAt: undefined,
              paymentRejectedByUserId: undefined,
              updatedAt: now
            }
          : item
      )
    );

    this.syncOrderById(orderId);
    return true;
  }

  verifyPendingPayment(orderId: string): boolean {
    const order = this.orders().find((item) => item.id === orderId);
    if (!order || order.paymentVerificationStatus !== 'PENDIENTE') {
      return false;
    }

    const now = new Date().toISOString();
    this.orders.update((orders) =>
      orders.map((item) =>
        item.id === orderId
          ? {
              ...item,
              status: 'COBRADO',
              closedAt: now,
              paymentVerificationStatus: 'VERIFICADO',
              paymentVerifiedAt: now,
              paymentVerifiedByUserId: this.currentUserId(),
              paymentRejectedAt: undefined,
              paymentRejectedByUserId: undefined,
              updatedAt: now
            }
          : item
      )
    );

    this.syncOrderById(orderId);
    return true;
  }

  rejectPendingPayment(orderId: string): boolean {
    const order = this.orders().find((item) => item.id === orderId);
    if (!order || order.paymentVerificationStatus !== 'PENDIENTE') {
      return false;
    }

    const now = new Date().toISOString();
    this.orders.update((orders) =>
      orders.map((item) =>
        item.id === orderId
          ? {
              ...item,
              paymentMethod: undefined,
              paymentReference: undefined,
              paymentAmountUsd: undefined,
              paymentAmountBs: undefined,
              paymentVerificationStatus: 'RECHAZADO',
              paymentRequestedAt: undefined,
              paymentVerifiedAt: undefined,
              paymentVerifiedByUserId: undefined,
              paymentRejectedAt: now,
              paymentRejectedByUserId: this.currentUserId(),
              updatedAt: now
            }
          : item
      )
    );

    this.syncOrderById(orderId);
    return true;
  }

  dismissActivePaymentVerificationNotification(): void {
    const current = this.activePaymentVerificationNotification();
    if (!current) {
      return;
    }

    this.storeAcknowledgedPaymentVerification(current.orderId);
    this.paymentVerificationNotifications.update((items) => items.slice(1));
  }

  completeOrders(orderIds: string[], payment?: PaymentCapture): void {
    const uniqueOrderIds = [...new Set(orderIds)].filter(Boolean);
    if (!uniqueOrderIds.length) {
      return;
    }

    const now = new Date().toISOString();
    const normalizedReference = payment?.paymentReference?.trim();
    this.orders.update((orders) =>
      orders.map((order) =>
        uniqueOrderIds.includes(order.id)
          ? {
              ...order,
              status: 'COBRADO',
              closedAt: now,
              paymentMethod: payment?.paymentMethod ?? order.paymentMethod,
              paymentReference: normalizedReference ?? order.paymentReference,
              paymentAmountUsd: payment?.paymentAmountUsd ?? order.paymentAmountUsd,
              paymentAmountBs: payment?.paymentAmountBs ?? order.paymentAmountBs,
              updatedAt: now
            }
          : order
      )
    );

    this.orders()
      .filter((item) => uniqueOrderIds.includes(item.id))
      .forEach((order) => {
        this.trackSyncOperation(
          () => this.firebaseData.markOrderAsPaid({
            orderId: order.id,
            status: order.status,
            closedAt: order.closedAt,
            updatedAt: order.updatedAt ?? now,
            paymentMethod: order.paymentMethod,
            paymentReference: order.paymentReference,
            paymentAmountUsd: order.paymentAmountUsd,
            paymentAmountBs: order.paymentAmountBs
          }),
          `Pago registrado para ${order.id}`,
          `No fue posible registrar el pago de la orden ${order.id} en Firebase.`
        );
      });
  }

  markDelivered(orderId: string): void {
    const now = new Date().toISOString();
    this.orders.update((orders) =>
      orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: 'ENTREGADO',
              items: order.items.map(item => ({ ...item, status: 'ENTREGADO', updatedAt: now })),
              updatedAt: now
            }
          : order
      )
    );
    this.syncOrderById(orderId);
  }

  markItemDelivered(orderId: string, itemId: string): void {
    const now = new Date().toISOString();
    this.orders.update((orders) =>
      orders.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        const updatedItems = order.items.map((item) =>
          item.id === itemId
            ? { ...item, status: 'ENTREGADO' as const, updatedAt: now }
            : item
        );

        const allItemsDelivered = updatedItems.every(
          (item) => item.status === 'ENTREGADO' || item.status === 'ANULADO'
        );

        return {
          ...order,
          items: updatedItems,
          status: allItemsDelivered ? 'ENTREGADO' : order.status,
          updatedAt: now
        };
      })
    );

    this.syncOrderById(orderId, { silent: true });
  }

  updateOrderClient(orderId: string, clientName: string, clientDocumentId: string): void {
    const now = new Date().toISOString();
    this.orders.update((orders) =>
      orders.map((order) =>
        order.id === orderId
          ? { ...order, clientName, clientDocumentId, updatedAt: now }
          : order
      )
    );
    this.syncOrderById(orderId);
  }

  deleteOrderInKitchen(orderId: string): boolean {
    if (!this.isAdmin()) {
      return false;
    }

    const order = this.orders().find((item) => item.id === orderId);
    if (!order || (order.status !== 'PENDIENTE' && order.status !== 'EN_PROCESO')) {
      return false;
    }

    const now = new Date().toISOString();
    const soldQuantities = this.getSoldQuantitiesByProduct(order.items, this.products());
    const productIds = [...soldQuantities.keys()];

    this.products.update((products) =>
      products.map((product) => {
        const restoreQuantity = soldQuantities.get(product.id) ?? 0;

        if (restoreQuantity <= 0) {
          return product;
        }

        return {
          ...product,
          stock: product.stock + restoreQuantity,
          available: true,
          updatedAt: now
        };
      })
    );

    this.restoreInventoryArticleDiscounts(this.toProductQuantityEntries(soldQuantities), now);

    // Eliminación lógica: marcar como ANULADO en lugar de borrar de la base de datos.
    // La comanda permanece en Firestore como registro auditable.
    this.orders.update((orders) =>
      orders.map((item) =>
        item.id === orderId
          ? {
              ...item,
              status: 'ANULADO' as const,
              cancelledAt: now,
              cancelledByUserId: this.currentUserId(),
              updatedAt: now
            }
          : item
      )
    );

    this.syncTouchedProducts(productIds);
    this.syncTouchedInventoryArticles(productIds);
    this.syncOrderById(orderId);

    return true;
  }

  deleteOrderItemInKitchen(orderId: string, itemId: string): boolean {
    if (!this.isAdmin()) {
      return false;
    }

    const order = this.orders().find((item) => item.id === orderId);
    if (!order || (order.status !== 'PENDIENTE' && order.status !== 'EN_PROCESO')) {
      return false;
    }

    const targetItem = order.items.find((item) => item.id === itemId);
    if (!targetItem) {
      return false;
    }

    // Si es el único ítem de la orden, anular la orden completa
    if (order.items.length <= 1) {
      return this.deleteOrderInKitchen(orderId);
    }

    const now = new Date().toISOString();
    const remainingItems = order.items.filter((item) => item.id !== itemId);

    // Calcular restitución de stock solo para este ítem
    const soldQuantities = this.getSoldQuantitiesByProduct([targetItem], this.products());
    const productIds = [...soldQuantities.keys()];

    this.products.update((products) =>
      products.map((product) => {
        const restoreQuantity = soldQuantities.get(product.id) ?? 0;

        if (restoreQuantity <= 0) {
          return product;
        }

        return {
          ...product,
          stock: product.stock + restoreQuantity,
          available: true,
          updatedAt: now
        };
      })
    );

    this.restoreInventoryArticleDiscounts(this.toProductQuantityEntries(soldQuantities), now);

    // Determinar nuevo estado de la orden (si todos los restantes están LISTO, pasa a LISTO)
    const hasPending = remainingItems.some(
      (item) => item.status === 'PENDIENTE' || item.status === 'EN_PROCESO'
    );
    const newStatus = hasPending ? order.status : 'LISTO';

    this.orders.update((orders) =>
      orders.map((item) =>
        item.id === orderId
          ? {
              ...item,
              items: remainingItems,
              status: newStatus,
              updatedAt: now
            }
          : item
      )
    );

    this.syncTouchedProducts(productIds);
    this.syncTouchedInventoryArticles(productIds);
    this.syncOrderById(orderId, { deletedItemIds: [itemId] });

    return true;
  }

  setProductAvailability(productId: string, available: boolean): void {
    const now = new Date().toISOString();
    this.products.update((products) =>
      products.map((product) =>
        product.id === productId ? { ...product, available, updatedAt: now } : product
      )
    );
    this.syncProductById(productId);
  }

  addProduct(input: {
    name: string;
    description?: string;
    restaurantId: RestaurantId;
    area: AreaId;
    category: Product['category'];
    promotionCategories?: Product['promotionCategories'];
    imageUrl?: string;
    price: number;
    stock: number;
    subItems?: import('./models').ProductSubItem[];
  }): Product {
    const now = new Date().toISOString();
    const isPapaYSon = input.restaurantId === 'PAPA_Y_SON';
    const product: Product = {
      id: this.nextProductId(),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      restaurantId: input.restaurantId,
      area: input.area,
      category: input.category,
      promotionCategories: this.normalizePromotionCategories(input.restaurantId, input.category, input.promotionCategories),
      imageUrl: input.imageUrl,
      price: input.price,
      stock: isPapaYSon ? input.stock : Math.max(input.stock, 0),
      available: isPapaYSon ? true : input.stock > 0,
      subItems: input.subItems?.length ? input.subItems : undefined,
      createdAt: now,
      updatedAt: now
    };

    this.products.update((products) => [product, ...products]);
    this.syncProduct(product);
    return product;
  }

  addProductCategory(name: string, restaurantId: RestaurantId, allowMultipleAreas: boolean = false): void {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    const now = new Date().toISOString();
    const id = `${restaurantId}_CAT_` + trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_' + Date.now().toString(36).toUpperCase();
    const category: ProductCategoryInfo = {
      id,
      restaurantId,
      name: trimmed,
      allowMultipleAreas,
      createdAt: now,
      updatedAt: now
    };

    this.productCategories.update((categories) => [...categories, category]);
    this.trackSyncOperation(
      () => this.firebaseData.saveProductCategory({
        id: category.id,
        restaurantId: category.restaurantId,
        name: category.name,
        ...(category.allowMultipleAreas !== undefined ? { allowMultipleAreas: category.allowMultipleAreas } : {}),
        createdAt: category.createdAt!,
        updatedAt: category.updatedAt!
      }),
      `Categoria ${category.name} creada`,
      `No fue posible crear la categoria ${category.name} en Firebase.`
    );
  }

  updateProductCategory(id: string, name: string, oldName?: string, allowMultipleAreas?: boolean): void {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    const now = new Date().toISOString();

    const categoryObj = this.productCategories().find(c => c.id === id);
    const restaurantId = categoryObj?.restaurantId;
    const actualOldName = oldName || categoryObj?.name || '';
    const actualAllowMultipleAreas = allowMultipleAreas !== undefined ? allowMultipleAreas : categoryObj?.allowMultipleAreas;

    this.productCategories.update((categories) =>
      categories.map((cat) =>
        cat.id === id ? { ...cat, name: trimmed, allowMultipleAreas: actualAllowMultipleAreas, updatedAt: now } : cat
      )
    );

    this.trackSyncOperation(
      () => this.firebaseData.saveProductCategory({
        id,
        restaurantId: restaurantId ?? 'PAPA_Y_SON',
        name: trimmed,
        ...(actualAllowMultipleAreas !== undefined ? { allowMultipleAreas: actualAllowMultipleAreas } : {}),
        createdAt: categoryObj?.createdAt ?? now,
        updatedAt: now
      }),
      `Categoria ${trimmed} actualizada`,
      `No fue posible actualizar la categoria ${trimmed} en Firebase.`
    );

    if (restaurantId) {
      const productsToUpdate = this.products().filter(p =>
        p.restaurantId === restaurantId &&
        (p.category === id || (actualOldName && p.category === actualOldName))
      );

      if (productsToUpdate.length > 0) {
        this.products.update((allProducts) =>
          allProducts.map((p) => {
            if (p.restaurantId === restaurantId && (p.category === id || (actualOldName && p.category === actualOldName))) {
              return { ...p, category: id, updatedAt: now };
            }
            return p;
          })
        );

        productsToUpdate.forEach(p => {
          const updatedProduct = {
            ...p,
            category: id,
            updatedAt: now
          };
          this.syncProduct(updatedProduct);
        });
      }
    }
  }

  deleteProductCategory(categoryId: string): void {
    const category = this.productCategories().find(c => c.id === categoryId);
    if (!category) return;

    this.productCategories.update((categories) => categories.filter(c => c.id !== categoryId));
    
    this.trackSyncOperation(
      () => this.firebaseData.deleteProductCategory(categoryId),
      `Categoria ${category.name} eliminada`,
      `No fue posible eliminar la categoria ${category.name} en Firebase.`
    );
  }

  deleteProduct(productId: string): void {
    const product = this.products().find(p => p.id === productId);
    if (!product) return;

    this.products.update((allProducts) => allProducts.filter(p => p.id !== productId));

    this.trackSyncOperation(
      () => this.firebaseData.deleteProduct(productId),
      `Producto ${product.name} eliminado`,
      `No fue posible eliminar el producto ${product.name} en Firebase.`
    );
  }

  addInventoryArticle(input: {
    name: string;
    restaurantId: RestaurantId;
    unit: InventoryMeasureUnit;
    quantity: number;
    linkedProducts: InventoryArticle['linkedProducts'];
  }): InventoryArticle {
    const now = new Date().toISOString();
    const article: InventoryArticle = {
      id: this.nextInventoryArticleId(),
      name: input.name.trim(),
      restaurantId: input.restaurantId,
      unit: input.unit,
      quantity: Math.max(input.quantity, 0),
      linkedProducts: input.linkedProducts
        .filter((link) => link.productId && link.quantityPerSale > 0)
        .map((link) => ({
          productId: link.productId,
          productName: link.productName,
          quantityPerSale: link.quantityPerSale
        })),
      createdAt: now,
      updatedAt: now
    };

    this.inventoryArticles.update((articles) => [article, ...articles]);
    this.syncInventoryArticle(article);
    return article;
  }

  updateInventoryArticle(input: {
    id: string;
    name: string;
    restaurantId: RestaurantId;
    unit: InventoryMeasureUnit;
    quantity: number;
    linkedProducts: InventoryArticle['linkedProducts'];
  }): void {
    const now = new Date().toISOString();
    this.inventoryArticles.update((articles) =>
      articles.map((article) =>
        article.id === input.id
          ? {
              ...article,
              name: input.name.trim(),
              restaurantId: input.restaurantId,
              unit: input.unit,
              quantity: Math.max(input.quantity, 0),
              linkedProducts: input.linkedProducts
                .filter((link) => link.productId && link.quantityPerSale > 0)
                .map((link) => ({
                  productId: link.productId,
                  productName: link.productName,
                  quantityPerSale: link.quantityPerSale
                })),
              updatedAt: now
            }
          : article
      )
    );

    this.syncInventoryArticleById(input.id);
  }

  async addStockToArticle(articleId: string, addedQuantity: number): Promise<void> {
    const article = this.inventoryArticles().find((item) => item.id === articleId);
    if (!article) return;

    const now = new Date().toISOString();
    const movementId = `MOV-${Date.now()}-${articleId}`;

    this.inventoryArticles.update((articles) =>
      articles.map((item) =>
        item.id === articleId
          ? {
              ...item,
              quantity: item.quantity + addedQuantity,
              updatedAt: now
            }
          : item
      )
    );

    this.syncInventoryArticleById(articleId);

    const movement: InventoryMovementDoc = {
      id: movementId,
      productId: articleId,
      restaurantId: article.restaurantId,
      type: 'IN_RESTOCK',
      quantity: addedQuantity,
      createdByUserId: this.currentUserId(),
      createdAt: now
    };

    await this.firebaseData.addInventoryMovement(movement);
  }

  async getInventoryMovementsByArticle(articleId: string): Promise<InventoryMovementDoc[]> {
    return this.firebaseData.getInventoryMovementsByArticle(articleId);
  }

  updateProduct(input: {
    id: string;
    name: string;
    description?: string;
    restaurantId: RestaurantId;
    area: AreaId;
    category: Product['category'];
    promotionCategories?: Product['promotionCategories'];
    imageUrl?: string | null;
    price: number;
    stock?: number;
    available: boolean;
    subItems?: import('./models').ProductSubItem[] | null;
  }): void {
    const now = new Date().toISOString();
    this.products.update((products) =>
      products.map((product) => {
        if (product.id !== input.id) {
          return product;
        }

        const isPapaYSon = input.restaurantId === 'PAPA_Y_SON';
        return {
          ...product,
          name: input.name.trim(),
          description: input.description?.trim() || undefined,
          restaurantId: input.restaurantId,
          area: input.area,
          category: input.category,
          promotionCategories: this.normalizePromotionCategories(input.restaurantId, input.category, input.promotionCategories),
          imageUrl: input.imageUrl !== undefined ? input.imageUrl || undefined : product.imageUrl,
          price: Math.max(input.price, 0),
          stock: isPapaYSon ? (input.stock ?? product.stock) : Math.max(input.stock ?? product.stock, 0),
          available: isPapaYSon ? input.available : ((input.stock ?? product.stock) > 0 ? input.available : false),
          subItems: input.subItems !== undefined ? input.subItems || undefined : product.subItems,
          updatedAt: now
        };
      })
    );

    this.syncProductById(input.id);
  }

  restockProduct(productId: string, amount: number): void {
    if (amount <= 0) {
      return;
    }

    const now = new Date().toISOString();
    this.products.update((products) =>
      products.map((product) =>
        product.id === productId
          ? { ...product, stock: product.stock + amount, available: true, updatedAt: now }
          : product
      )
    );
    this.syncProductById(productId);
  }

  getAreaQueue(area: AreaId, restaurant: RestaurantId | 'ALL') {
    return this.getVisibleOrdersForModule('operacion')
      .filter((order) => order.status !== 'COBRADO' && order.status !== 'ANULADO')
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => {
          if (item.status === 'ENTREGADO' || item.status === 'COBRADO' || item.status === 'ANULADO') {
            return false;
          }
          if (restaurant !== 'ALL' && item.restaurantId !== restaurant) {
            return false;
          }

          const hasSubItems = !!(item.subItems && item.subItems.length > 0);

          if (hasSubItems) {
            return item.subItems!.some((sub) => sub.area === area);
          }

          return item.area === area;
        }).map((item) => {
          if (item.subItems && item.subItems.length > 0) {
            const matchingSubItems = item.subItems
              .filter((sub) => sub.area === area && !sub.ready)
              .map((sub) => sub.name)
              .join(' | ');
            if (matchingSubItems) {
              return { ...item, productName: `${item.productName} (${matchingSubItems})` };
            }
          }
          return item;
        })
      }))
      .filter((order) => order.items.length > 0);
  }

  getReport(period: 'DIARIO' | 'SEMANAL' | 'MENSUAL', restaurant: RestaurantId | 'ALL'): SalesReport {
    const fromDate = this.getFromDate(period);
    const filteredOrders = this.getVisibleOrdersForModule('reportes').filter((order) => {
      const inDate = new Date(order.createdAt) >= fromDate;
      if (!inDate) {
        return false;
      }

      if (restaurant === 'ALL') {
        return true;
      }

      return order.items.some((item) => item.restaurantId === restaurant);
    });

    const byProductMap = new Map<string, { name: string; quantity: number; sales: number }>();
    const byRestaurant: Record<RestaurantId, number> = {
      PAPA_Y_SON: 0,
      NEXT_RESTOBAR: 0,
      LAGOS: 0
    };

    let totalItems = 0;

    filteredOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (restaurant !== 'ALL' && item.restaurantId !== restaurant) {
          return;
        }

        const sales = item.quantity * item.unitPrice;
        totalItems += item.quantity;
        byRestaurant[item.restaurantId] += sales;

        const current = byProductMap.get(item.productId);
        if (current) {
          byProductMap.set(item.productId, {
            ...current,
            quantity: current.quantity + item.quantity,
            sales: current.sales + sales
          });
        } else {
          byProductMap.set(item.productId, {
            name: item.productName,
            quantity: item.quantity,
            sales
          });
        }
      });
    });

    const byProduct = [...byProductMap.values()].sort((a, b) => b.sales - a.sales);
    const totalSales = byProduct.reduce((sum, product) => sum + product.sales, 0);

    return {
      period,
      ordersCount: filteredOrders.length,
      totalSales,
      totalItems,
      byRestaurant,
      byProduct
    };
  }

  private async loadOrdersFromFirebase(): Promise<void> {
    try {
      const orderDocs = await this.firebaseData.listOrders();
      const orderIds = orderDocs.map((orderDoc) => orderDoc.id);
      const itemsByOrderId = await this.firebaseData.listOrderItemsByOrderIds(orderIds);
      const orders = orderDocs.map((orderDoc) =>
        this.mapOrderDocToOrder(orderDoc, itemsByOrderId[orderDoc.id] ?? [])
      );

      this.orders.set(
        orders.sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        )
      );

      this.queueVerifiedPaymentNotifications(orders);

      this.runtimeDataError.set('');

    } catch (error) {
      this.runtimeDataError.set('No se pudieron cargar las comandas.');
      console.error('No fue posible cargar comandas desde Firebase.', error);
    }
  }

  private async loadAppSettingsFromFirebase(): Promise<void> {
    try {
      const settingsDocs = await this.firebaseData.listAppSettings();
      const existing = settingsDocs.find((item) => item.id === GENERAL_APP_SETTINGS_ID);

      if (!existing) {
        const now = new Date().toISOString();
        const defaults: AppSettings = {
          ...DEFAULT_APP_SETTINGS,
          createdAt: now,
          updatedAt: now
        };

        this.appSettings.set(defaults);
        await this.firebaseData.saveAppSettings(this.mapAppSettingsToDoc(defaults));
        return;
      }

      this.appSettings.set(this.mapAppSettingsDocToAppSettings(existing));
      void this.syncBcvRateFromApi();
    } catch (error) {
      console.error('No fue posible cargar los ajustes globales.', error);
      this.appSettings.set(DEFAULT_APP_SETTINGS);
    }
  }

  refreshBcvRate(): Promise<void> {
    return this.syncBcvRateFromApi({ force: true });
  }

  private startBcvAutoSync(): void {
    if (typeof window === 'undefined' || this.bcvAutoSyncTimer) {
      return;
    }

    const sync = () => {
      void this.syncBcvRateFromApi();
    };

    this.bcvAutoSyncTimer = setInterval(sync, BCV_AUTO_SYNC_INTERVAL_MS);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
  }

  private async syncBcvRateFromApi(options?: { force?: boolean }): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    const force = options?.force ?? false;

    if (!force && this.getLastBcvAutoSyncDay() === this.getTodayDayKey()) {
      return;
    }

    if (this.bcvAutoSyncPromise) {
      return this.bcvAutoSyncPromise;
    }

    const now = Date.now();
    if (now - this.lastBcvAutoSyncAttemptAt < BCV_AUTO_SYNC_DEBOUNCE_MS) {
      return;
    }

    this.lastBcvAutoSyncAttemptAt = now;

    this.bcvAutoSyncPromise = (async () => {
      try {
        const response = await firstValueFrom(this.dolarService.obtenerOficial());
        const nextRate = this.normalizeBcvRate(
          response.promedio ?? response.venta ?? response.compra ?? 0
        );

        if (nextRate <= 0) {
          return;
        }

        const currentSettings = this.appSettings();
        const responseTimestamp = response.fechaActualizacion || new Date().toISOString();
        const sameRate = currentSettings.bcvRate === nextRate;
        const sameUpdate = currentSettings.updatedAt === responseTimestamp;

        if (!sameRate || !sameUpdate) {
          const nextSettings: AppSettings = {
            ...currentSettings,
            id: currentSettings.id || GENERAL_APP_SETTINGS_ID,
            bcvRate: nextRate,
            createdAt: currentSettings.createdAt ?? responseTimestamp,
            updatedAt: responseTimestamp
          };

          this.appSettings.set(nextSettings);
          this.trackSyncOperation(
            () => this.firebaseData.saveAppSettings(this.mapAppSettingsToDoc(nextSettings)),
            'Tasa BCV actualizada',
            'No fue posible actualizar la tasa BCV automaticamente.',
            { silent: true }
          );
        }

        this.setLastBcvAutoSyncDay(this.getTodayDayKey());
      } catch (error) {
        console.error('No fue posible sincronizar la tasa BCV desde DolarApi.', error);
      } finally {
        this.bcvAutoSyncPromise = null;
      }
    })();

    return this.bcvAutoSyncPromise;
  }

  private getLastBcvAutoSyncDay(): string {
    if (typeof localStorage === 'undefined') {
      return '';
    }

    return localStorage.getItem(BCV_AUTO_SYNC_STORAGE_KEY) ?? '';
  }

  private setLastBcvAutoSyncDay(dayKey: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(BCV_AUTO_SYNC_STORAGE_KEY, dayKey);
  }

  private getTodayDayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async loadUsersFromFirebase(): Promise<boolean> {
    try {
      const userDocs = await this.firebaseData.listUsers();
      const now = new Date().toISOString();
      const existingById = new Map(userDocs.map((doc) => [doc.id, doc]));

      const usersToSync = INITIAL_USERS.filter(seed => {
        const existing = existingById.get(seed.id);
        return !existing ||
          existing.email !== seed.email ||
          existing.role !== seed.role ||
          existing.isActive !== seed.isActive ||
          JSON.stringify(existing.restaurantIds) !== JSON.stringify(seed.restaurantIds);
      });

      if (usersToSync.length > 0) {
        await Promise.all(
          usersToSync.map((user) => {
            const existing = existingById.get(user.id);
            return this.firebaseData.saveUser({
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              role: user.role,
              restaurantIds: user.restaurantIds,
              isActive: user.isActive,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now
            });
          })
        );
      }

      const mergedUsers = [
        ...userDocs
          .map((user) => this.mapUserDocToUser(user))
          .filter((user) => !INITIAL_USERS.some((seed) => seed.id === user.id)),
        ...INITIAL_USERS.map((seed) => ({
          ...seed,
          createdAt: existingById.get(seed.id)?.createdAt ?? now,
          updatedAt: now
        }))
      ];

      this.users.set(mergedUsers);

      const current = this.currentUser();
      if (current) {
        const updatedUser = mergedUsers.find((user) => user.id === current.id && user.isActive);
        if (updatedUser) {
          this.currentUser.set(updatedUser);
          this.persistSession(updatedUser);
        } else {
          this.signOut();
        }
      }

      return true;

    } catch (error) {
      console.error('No fue posible cargar usuarios desde Firebase.', error);
      return false;
    }
  }

  private persistSession(user: AppUser): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ id: user.id, email: user.email })
    );
  }

  private restoreSessionFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { id?: string; email?: string };
      if (parsed?.id && parsed?.email) {
        const availableUsers = [...this.users(), ...INITIAL_USERS];
        const match = availableUsers.find(
          (u) => u.id === parsed.id && u.email.toLowerCase() === parsed.email!.toLowerCase() && u.isActive
        );
        if (match) {
          this.currentUser.set(match);
        }
      }
    } catch {
      this.clearSession();
    }
  }

  private clearSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  private watchFirebaseAuthSession(): void {
    onIdTokenChanged(authDb, (authUser) => {
      if (!this.authInitializationResolved) {
        this.authInitializationResolved = true;
        this.resolveAuthInitialization?.();
        this.resolveAuthInitialization = null;
      }

      if (authUser) {
        if (this.currentUser()) {
          this.startBcvAutoSync();
          void this.loadUsersFromFirebase();
          void this.refreshRuntimeDataFromFirebase();
        }
      } else {
        const sessionUser = this.currentUser();
        if (sessionUser) {
          this.currentUser.set(null);
          this.clearSession();
        }
      }
    });
  }

  private async ensureAuthSessionActive(): Promise<boolean> {
    const sessionUser = this.currentUser();
    if (!sessionUser) {
      return true;
    }

    await this.authInitializationPromise;

    const activeSessionUser = this.currentUser();
    if (!activeSessionUser) {
      return false;
    }

    const authUser = authDb.currentUser;
    const authEmail = authUser?.email?.toLowerCase();
    if (!authUser || !authEmail || authEmail !== activeSessionUser.email.toLowerCase()) {
      this.currentUser.set(null);
      this.clearSession();
      return false;
    }

    if (Date.now() - this.lastAuthValidationAt < AUTH_SESSION_REVALIDATION_MS) {
      return true;
    }

    try {
      await authUser.getIdToken(false);
      this.lastAuthValidationAt = Date.now();
      return true;
    } catch (error: any) {
      if (error?.code === 'auth/network-request-failed' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        return true;
      }
      if (error?.code === 'auth/user-disabled' || error?.code === 'auth/user-not-found') {
        this.currentUser.set(null);
        this.clearSession();
        void firebaseSignOut(authDb).catch(() => undefined);
        return false;
      }
      return true;
    }
  }

  private async loadCustomersFromFirebase(): Promise<void> {
    try {
      const customerDocs = await this.firebaseData.listCustomers();
      this.customers.set(
        customerDocs
          .map((customer) => this.mapCustomerDocToCustomer(customer))
          .sort((left, right) => left.name.localeCompare(right.name))
      );
      this.runtimeDataError.set('');
    } catch (error) {
      this.runtimeDataError.set('No se pudieron cargar los clientes.');
      console.error('No fue posible cargar clientes desde Firebase.', error);
    }
  }

  private normalizeClientName(clientName: string): string {
    const trimmed = clientName.trim();
    return trimmed.toLowerCase() === 'cliente qr' ? 'Cliente' : trimmed;
  }

  private normalizeClientDocumentId(documentId: string): string {
    return documentId.replace(/[^0-9]/g, '').trim();
  }

  private async loadProductsFromFirebase(): Promise<void> {
    try {
      const firebaseProducts = await this.firebaseData.listProducts();
      if (!firebaseProducts.length) {
        this.runtimeDataError.set('');
        return;
      }

      this.products.set(firebaseProducts.map((product) => this.mapProductDocToProduct(product)));
      this.runtimeDataError.set('');
    } catch (error) {
      this.runtimeDataError.set('No se pudieron cargar los productos.');
      console.error('No fue posible cargar productos desde Firebase.', error);
    }
  }

  private async loadInventoryArticlesFromFirebase(): Promise<void> {
    try {
      const firebaseArticles = await this.firebaseData.listInventoryArticles();
      this.inventoryArticles.set(
        firebaseArticles
          .map((article) => this.mapInventoryArticleDocToInventoryArticle(article))
          .sort((left, right) => left.name.localeCompare(right.name))
      );
      this.runtimeDataError.set('');
    } catch (error) {
      this.runtimeDataError.set('No se pudieron cargar los articulos.');
      console.error('No fue posible cargar articulos desde Firebase.', error);
    }
  }

  private async loadProductCategoriesFromFirebase(): Promise<void> {
    try {
      const firebaseCategories = await this.firebaseData.listProductCategories();
      if (!firebaseCategories.length) {
        const defaultCategories = [
          { key: 'COMIDA', name: 'Comida' },
          { key: 'BEBIDA', name: 'Bebida' },
          { key: 'PIZZA', name: 'Pizza' },
          { key: 'MOSTRADOR', name: 'Mostrador' },
          { key: 'PROMOCION', name: 'Promocion' }
        ];
        const now = new Date().toISOString();
        const docs: ProductCategoryDoc[] = [];

        this.restaurants().forEach((rest) => {
          defaultCategories.forEach((cat) => {
            docs.push({
              id: `${rest.id}_${cat.key}`,
              restaurantId: rest.id,
              name: cat.name,
              createdAt: now,
              updatedAt: now
            });
          });
        });

        await Promise.all(docs.map(doc => this.firebaseData.saveProductCategory(doc)));
        
        this.productCategories.set(
          docs.map((d) => ({
            id: d.id,
            restaurantId: d.restaurantId,
            name: d.name,
            allowMultipleAreas: d.allowMultipleAreas,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          }))
        );
        this.runtimeDataError.set('');
        return;
      }

      this.productCategories.set(
        firebaseCategories.map((cat) => ({
          id: cat.id,
          restaurantId: cat.restaurantId,
          name: cat.name,
          allowMultipleAreas: cat.allowMultipleAreas,
          createdAt: cat.createdAt,
          updatedAt: cat.updatedAt
        }))
      );
      this.runtimeDataError.set('');
    } catch (error) {
      this.runtimeDataError.set('No se pudieron cargar las categorias.');
      console.error('No fue posible cargar las categorias desde Firebase.', error);
    }
  }

  private ensureAllProductCategoriesExist(): void {
    const products = this.products();
    const categories = this.productCategories();
    const now = new Date().toISOString();
    const toSave: ProductCategoryDoc[] = [];

    products.forEach((product) => {
      const exists = categories.some((c) => c.id === product.category);
      if (!exists) {
        let rawKey = product.category;
        if (rawKey.startsWith(product.restaurantId + '_')) {
          rawKey = rawKey.substring(product.restaurantId.length + 1);
        }
        const friendlyName = rawKey
          .toLowerCase()
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase());

        const newCat: ProductCategoryDoc = {
          id: product.category,
          restaurantId: product.restaurantId,
          name: friendlyName,
          createdAt: now,
          updatedAt: now
        };
        toSave.push(newCat);
        categories.push({
          id: newCat.id,
          restaurantId: newCat.restaurantId,
          name: newCat.name,
          createdAt: newCat.createdAt,
          updatedAt: newCat.updatedAt
        });
      }
    });

    if (toSave.length > 0) {
      this.productCategories.set([...categories]);
      toSave.forEach((doc) => {
        void this.firebaseData.saveProductCategory(doc).catch((err) => {
          console.error(`Error auto-creando categoria faltante ${doc.id}:`, err);
        });
      });
    }
  }

  private syncProductById(productId: string): void {
    const product = this.products().find((item) => item.id === productId);
    if (!product) {
      return;
    }

    this.syncProduct(product);
  }

  private syncProduct(product: Product): void {
    const productDoc: ProductDoc = {
      id: product.id,
      name: product.name,
      description: product.description,
      restaurantId: product.restaurantId,
      area: product.area,
      category: product.category,
      promotionCategories: this.normalizePromotionCategories(product.restaurantId, product.category, product.promotionCategories),
      imageUrl: product.imageUrl,
      price: product.price,
      stock: product.stock,
      available: product.available,
      subItems: product.subItems,
      createdAt: product.createdAt ?? product.updatedAt ?? new Date().toISOString(),
      updatedAt: product.updatedAt ?? new Date().toISOString()
    };

    const cleanProductDoc = Object.fromEntries(
      Object.entries(productDoc).filter(([_, v]) => v !== undefined)
    ) as unknown as ProductDoc;

    this.trackSyncOperation(
      () => this.firebaseData.saveProduct(cleanProductDoc),
      `Producto ${product.name} sincronizado`,
      `No fue posible sincronizar el producto ${product.id} con Firebase.`
    );
  }

  private syncInventoryArticleById(articleId: string): void {
    const article = this.inventoryArticles().find((item) => item.id === articleId);
    if (!article) {
      return;
    }

    this.syncInventoryArticle(article);
  }

  private syncInventoryArticle(article: InventoryArticle): void {
    const articleDoc: InventoryArticleDoc = {
      id: article.id,
      name: article.name,
      restaurantId: article.restaurantId,
      unit: article.unit,
      quantity: article.quantity,
      linkedProducts: article.linkedProducts.map((link) => ({
        productId: link.productId,
        productName: link.productName,
        quantityPerSale: link.quantityPerSale
      })),
      createdAt: article.createdAt ?? article.updatedAt ?? new Date().toISOString(),
      updatedAt: article.updatedAt ?? new Date().toISOString()
    };

    this.trackSyncOperation(
      () => this.firebaseData.saveInventoryArticle(articleDoc),
      `Articulo ${article.name} sincronizado`,
      `No fue posible sincronizar el articulo ${article.id} con Firebase.`
    );
  }

  private mapProductDocToProduct(product: ProductDoc): Product {
    let category = product.category;
    const oldCategories = ['COMIDA', 'BEBIDA', 'PIZZA', 'MOSTRADOR', 'PROMOCION'];
    if (oldCategories.includes(category)) {
      category = `${product.restaurantId}_${category}`;
    }

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      restaurantId: product.restaurantId,
      area: product.area,
      category: category,
      promotionCategories: this.normalizePromotionCategories(product.restaurantId, category, product.promotionCategories),
      imageUrl: product.imageUrl,
      price: product.price,
      stock: product.stock,
      available: product.available,
      subItems: product.subItems,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };
  }

  private mapInventoryArticleDocToInventoryArticle(article: InventoryArticleDoc): InventoryArticle {
    return {
      id: article.id,
      name: article.name,
      restaurantId: article.restaurantId,
      unit: article.unit,
      quantity: article.quantity,
      linkedProducts: article.linkedProducts.map((link) => ({
        productId: link.productId,
        productName: link.productName,
        quantityPerSale: link.quantityPerSale
      })),
      createdAt: article.createdAt,
      updatedAt: article.updatedAt
    };
  }

  uploadProductImage(file: File, restaurantId: RestaurantId, productId: string): Promise<string> {
    return this.firebaseData.uploadProductImage({ file, restaurantId, productId });
  }

  private mapAppSettingsDocToAppSettings(settings: AppSettingsDoc): AppSettings {
    return {
      id: settings.id,
      defaultTipPercent: this.normalizeTipPercent(settings.defaultTipPercent),
      bcvRate: this.normalizeBcvRate(settings.bcvRate),
      orderCounters: this.normalizeOrderCounters(settings.orderCounters),
      adminSecurityPin: settings.adminSecurityPin ?? DEFAULT_ADMIN_PIN,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt
    };
  }

  private mapUserDocToUser(user: UserDoc): AppUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      restaurantIds: user.restaurantIds,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  private mapCustomerDocToCustomer(customer: CustomerDoc): Customer {
    return {
      documentId: customer.id,
      name: customer.name,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    };
  }

  private mapAppSettingsToDoc(settings: AppSettings): AppSettingsDoc {
    const now = settings.updatedAt ?? new Date().toISOString();

    return {
      id: settings.id,
      defaultTipPercent: this.normalizeTipPercent(settings.defaultTipPercent),
      bcvRate: this.normalizeBcvRate(settings.bcvRate),
      orderCounters: this.normalizeOrderCounters(settings.orderCounters),
      adminSecurityPin: settings.adminSecurityPin ?? DEFAULT_ADMIN_PIN,
      createdAt: settings.createdAt ?? now,
      updatedAt: now
    };
  }

  private mapOrderDocToOrder(order: OrderDoc, items: OrderItemDoc[]): Order {
    return {
      id: order.id,
      tableNumber: order.tableNumber,
      clientName: this.normalizeClientName(order.clientName),
      clientDocumentId: order.clientDocumentId,
      source: order.source,
      createdByUserId: order.createdByUserId,
      status: order.status,
      createdAt: order.createdAt,
      closedAt: order.closedAt,
      paymentMethod: order.paymentMethod,
      paymentReference: order.paymentReference,
      paymentAmountUsd: order.paymentAmountUsd,
      paymentAmountBs: order.paymentAmountBs,
      paymentVerificationStatus: order.paymentVerificationStatus,
      paymentRequestedAt: order.paymentRequestedAt,
      paymentVerifiedAt: order.paymentVerifiedAt,
      paymentVerifiedByUserId: order.paymentVerifiedByUserId,
      paymentRejectedAt: order.paymentRejectedAt,
      paymentRejectedByUserId: order.paymentRejectedByUserId,
      cancelledAt: order.cancelledAt,
      cancelledByUserId: order.cancelledByUserId,
      updatedAt: order.updatedAt,
      items: items
        .filter((item) => {
          const itemTime = new Date(item.createdAt ?? item.updatedAt ?? 0).getTime();
          const orderTime = new Date(order.createdAt).getTime();
          // A margin of 10 seconds is used to account for any slight timestamp discrepancies
          // Old items will have hours or days of difference.
          return itemTime >= orderTime - 10000;
        })
        .map((item) => ({
          id: item.id,
        productId: item.productId,
        productName: item.productName,
        restaurantId: item.restaurantId,
        area: item.area,
        quantity: item.quantity,
        note: item.note,
        unitPrice: item.unitPrice,
        status: item.status,
        subItems: item.subItems,
        mainReady: item.mainReady,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    };
  }

  private syncNewOrder(order: Order): void {
    const orderDoc = this.mapOrderToOrderDoc(order);
    const itemDocs = order.items.map((item) => this.mapOrderItemToOrderItemDoc(order.id, item));
    const inventoryMovements: InventoryMovementDoc[] = order.items.map((item) => ({
      id: `MOV-${item.id}`,
      productId: item.productId,
      restaurantId: item.restaurantId,
      type: 'OUT_SALE',
      quantity: item.quantity,
      orderId: order.id,
      createdByUserId: order.createdByUserId,
      createdAt: item.updatedAt ?? order.updatedAt ?? order.createdAt
    }));

    this.trackSyncOperation(
      () => this.firebaseData.createOrderBundle({ order: orderDoc, items: itemDocs, inventoryMovements }),
      `Comanda ${order.id} sincronizada`,
      `No fue posible crear la orden ${order.id} en Firebase.`
    );
  }

  private syncOrderById(
    orderId: string,
    options?: { silent?: boolean; deletedItemIds?: string[] }
  ): void {
    const order = this.orders().find((item) => item.id === orderId);
    if (!order) {
      return;
    }

    const orderDoc = this.mapOrderToOrderDoc(order);
    const itemDocs = order.items.map((item) => this.mapOrderItemToOrderItemDoc(order.id, item));

    this.trackSyncOperation(
      () =>
        this.firebaseData.saveOrderSnapshot({
          order: orderDoc,
          items: itemDocs,
          deletedItemIds: options?.deletedItemIds
        }),
      `Comanda ${orderId} actualizada`,
      `No fue posible sincronizar la orden ${orderId} con Firebase.`,
      options
    );
  }

  private syncTouchedProducts(productIds: string[]): void {
    [...new Set(productIds)].forEach((productId) => this.syncProductById(productId));
  }

  private syncTouchedInventoryArticles(productIds: string[]): void {
    const touchedIds = new Set(
      this.inventoryArticles()
        .filter((article) => article.linkedProducts.some((link) => productIds.includes(link.productId)))
        .map((article) => article.id)
    );

    [...touchedIds].forEach((articleId) => this.syncInventoryArticleById(articleId));
  }

  private buildOrderItemsFromDrafts(
    draftItems: DraftItem[],
    products: Product[],
    enforceRestaurantScope: boolean,
    allowedRestaurants: RestaurantId[]
  ): Array<{
    id: string;
    productId: string;
    productName: string;
    restaurantId: RestaurantId;
    area: AreaId;
    quantity: number;
    note?: string;
    unitPrice: number;
    status: 'PENDIENTE';
    subItems?: import('./models').ProductSubItem[];
  }> {
    const built: Array<{
      id: string;
      productId: string;
      productName: string;
      restaurantId: RestaurantId;
      area: AreaId;
      quantity: number;
      note?: string;
      unitPrice: number;
      status: 'PENDIENTE';
      subItems?: import('./models').ProductSubItem[];
    }> = [];

    draftItems.forEach((draft) => {
      const product = products.find((p) => p.id === draft.productId);
      if (
        !product ||
        !product.available ||
        (product.restaurantId !== 'PAPA_Y_SON' && product.stock < draft.quantity) ||
        (enforceRestaurantScope && !allowedRestaurants.includes(product.restaurantId))
      ) {
        return;
      }

      const note = draft.note?.trim() || undefined;
      const promotionCategories = this.normalizePromotionCategories(product.restaurantId, product.category, product.promotionCategories);

      if (product.category.endsWith('_PROMOCION') && promotionCategories.length > 0) {
        const splitPrices = this.splitPrice(product.price, promotionCategories.length);
        promotionCategories.forEach((category, index) => {
          built.push({
            id: this.nextItemId(),
            productId: product.id,
            productName: `${product.name} · ${this.promotionCategoryLabel(category)}`,
            restaurantId: product.restaurantId,
            area: this.areaByPromotionCategory(category),
            quantity: draft.quantity,
            note,
            unitPrice: splitPrices[index] ?? 0,
            status: 'PENDIENTE'
          });
        });
        return;
      }

      built.push({
        id: this.nextItemId(),
        productId: product.id,
        productName: product.name,
        restaurantId: product.restaurantId,
        area: product.area,
        quantity: draft.quantity,
        note,
        unitPrice: product.price,
        status: 'PENDIENTE',
        subItems: product.subItems ? JSON.parse(JSON.stringify(product.subItems)) : undefined
      });
    });

    return built;
  }

  private getSoldQuantitiesByProduct(
    items: Array<{ productId: string; quantity: number }>,
    products: Product[]
  ): Map<string, number> {
    const raw = new Map<string, number>();
    items.forEach((item) => {
      raw.set(item.productId, (raw.get(item.productId) ?? 0) + item.quantity);
    });

    const normalized = new Map<string, number>();
    raw.forEach((quantity, productId) => {
      const product = products.find((item) => item.id === productId);
      const promotionParts =
        product?.category.endsWith('_PROMOCION')
          ? this.normalizePromotionCategories(product.restaurantId, product.category, product.promotionCategories).length
          : 1;
      const divisor = promotionParts > 0 ? promotionParts : 1;
      normalized.set(productId, quantity / divisor);
    });

    return normalized;
  }

  private toProductQuantityEntries(quantities: Map<string, number>): Array<{ productId: string; quantity: number }> {
    return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private splitPrice(total: number, parts: number): number[] {
    if (parts <= 1) {
      return [total];
    }

    const cents = Math.round(total * 100);
    const base = Math.floor(cents / parts);
    const remainder = cents - base * parts;
    return Array.from({ length: parts }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
  }

  private areaByPromotionCategory(category: ProductBaseCategory): AreaId {
    if (category.endsWith('_BEBIDA')) {
      return 'BARRA';
    }

    if (category.endsWith('_PIZZA')) {
      return 'PIZZERIA';
    }

    if (category.endsWith('_MOSTRADOR')) {
      return 'CAJA';
    }

    return 'COCINA';
  }

  private promotionCategoryLabel(category: ProductBaseCategory): string {
    const found = this.productCategories().find((c) => c.id === category);
    return found ? found.name : category;
  }

  private normalizePromotionCategories(
    restaurantId: RestaurantId,
    category: Product['category'],
    promotionCategories?: Product['promotionCategories']
  ): ProductBaseCategory[] {
    if (!category.endsWith('_PROMOCION')) {
      return [];
    }

    const oldCategories = ['COMIDA', 'BEBIDA', 'PIZZA', 'MOSTRADOR'];
    const resolvedPromoCategories = (promotionCategories ?? []).map(cat => {
      if (oldCategories.includes(cat)) {
        return `${restaurantId}_${cat}`;
      }
      return cat;
    });

    const validCategories = this.productCategories()
      .filter(c => c.restaurantId === restaurantId && !c.id.endsWith('_PROMOCION'))
      .map(c => c.id);

    return [...new Set(resolvedPromoCategories.filter((item): item is ProductBaseCategory => validCategories.includes(item)))];
  }

  private applyInventoryArticleDiscounts(
    items: Array<{ productId: string; quantity: number }>,
    timestamp: string
  ): void {
    const saleQuantities = new Map<string, number>();
    items.forEach((item) => {
      saleQuantities.set(item.productId, (saleQuantities.get(item.productId) ?? 0) + item.quantity);
    });

    this.inventoryArticles.update((articles) =>
      articles.map((article) => {
        const totalDiscount = article.linkedProducts.reduce((sum, link) => {
          const sold = saleQuantities.get(link.productId) ?? 0;
          return sum + sold * link.quantityPerSale;
        }, 0);

        if (totalDiscount <= 0) {
          return article;
        }

        const isPapaYSon = article.restaurantId === 'PAPA_Y_SON';
        return {
          ...article,
          quantity: isPapaYSon ? article.quantity - totalDiscount : Math.max(article.quantity - totalDiscount, 0),
          updatedAt: timestamp
        };
      })
    );
  }

  private restoreInventoryArticleDiscounts(
    items: Array<{ productId: string; quantity: number }>,
    timestamp: string
  ): void {
    const saleQuantities = new Map<string, number>();
    items.forEach((item) => {
      saleQuantities.set(item.productId, (saleQuantities.get(item.productId) ?? 0) + item.quantity);
    });

    this.inventoryArticles.update((articles) =>
      articles.map((article) => {
        const restoreAmount = article.linkedProducts.reduce((sum, link) => {
          const sold = saleQuantities.get(link.productId) ?? 0;
          return sum + sold * link.quantityPerSale;
        }, 0);

        if (restoreAmount <= 0) {
          return article;
        }

        return {
          ...article,
          quantity: article.quantity + restoreAmount,
          updatedAt: timestamp
        };
      })
    );
  }

  private nextInventoryArticleId(): string {
    return `ART-${crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`;
  }

  private upsertCustomer(documentId: string, name: string, timestamp: string): void {
    const normalizedName = this.normalizeClientName(name);
    this.customers.update((customers) => {
      const existing = customers.find((customer) => customer.documentId === documentId);
      if (existing) {
        return customers.map((customer) =>
          customer.documentId === documentId
            ? { ...customer, name: normalizedName, updatedAt: timestamp }
            : customer
        );
      }

      return [
        ...customers,
        {
          documentId,
          name: normalizedName,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ];
    });

    const customerDoc: CustomerDoc = {
      id: documentId,
      name: normalizedName,
      createdAt:
        this.customers().find((customer) => customer.documentId === documentId)?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    this.trackSyncOperation(
      () => this.firebaseData.saveCustomer(customerDoc),
      `Cliente ${normalizedName} sincronizado`,
      `No fue posible sincronizar el cliente ${documentId} con Firebase.`
    );
  }

  private trackSyncOperation(
    operation: () => Promise<unknown>,
    successMessage: string,
    errorMessage: string,
    options?: { silent?: boolean }
  ): void {
    if (options?.silent) {
      void operation().catch((error) => {
        console.error(errorMessage, error);
      });
      return;
    }

    if (this.syncOverlayTimeoutId) {
      clearTimeout(this.syncOverlayTimeoutId);
      this.syncOverlayTimeoutId = null;
    }

    this.pendingSyncOperations += 1;
    let counted = true;
    let timedOut = false;

    const releasePendingOperation = () => {
      if (!counted) {
        return;
      }

      this.pendingSyncOperations = Math.max(this.pendingSyncOperations - 1, 0);
      counted = false;
    };

    this.syncOverlayVisible.set(true);
    this.syncOverlayStatus.set('uploading');
    this.syncOverlayMessage.set('Subiendo datos...');
    this.syncOverlayCanRetry.set(false);
    this.syncOverlayRetryOperation = null;

    const networkTimeoutId = setTimeout(() => {
      timedOut = true;
      releasePendingOperation();
      this.syncOverlayVisible.set(true);
      this.syncOverlayStatus.set('error');
      this.syncOverlayMessage.set('Error de red. La operacion tardo demasiado. Reintenta.');
      this.syncOverlayCanRetry.set(true);
      this.syncOverlayRetryOperation = operation;
    }, NETWORK_OPERATION_TIMEOUT_MS);

    void operation()
      .then(() => {
        clearTimeout(networkTimeoutId);
        if (timedOut) {
          return;
        }
        this.finishSyncOperation('completed', successMessage);
      })
      .catch((error) => {
        clearTimeout(networkTimeoutId);
        if (timedOut) {
          return;
        }
        console.error(errorMessage, error);
        this.syncOverlayCanRetry.set(true);
        this.syncOverlayRetryOperation = operation;
        const msg = error instanceof Error ? error.message : String(error);
        this.finishSyncOperation('error', `Error en operacion: ${msg}`);
      });
  }

  private finishSyncOperation(status: Exclude<SyncOverlayStatus, 'idle' | 'uploading'>, message: string): void {
    this.pendingSyncOperations = Math.max(this.pendingSyncOperations - 1, 0);
    if (this.pendingSyncOperations > 0) {
      return;
    }

    this.syncOverlayVisible.set(true);
    this.syncOverlayStatus.set(status);
    this.syncOverlayMessage.set(message);
    if (status === 'error') {
      this.syncOverlayCanRetry.set(true);
      return;
    }

    this.syncOverlayTimeoutId = setTimeout(() => {
      this.syncOverlayVisible.set(false);
      this.syncOverlayStatus.set('idle');
      this.syncOverlayMessage.set('');
      this.syncOverlayCanRetry.set(false);
      this.syncOverlayRetryOperation = null;
      this.syncOverlayTimeoutId = null;
    }, SYNC_OVERLAY_AUTOHIDE_MS);
  }

  private mapOrderToOrderDoc(order: Order): OrderDoc {
    const orderDoc: OrderDoc = {
      id: order.id,
      tableNumber: order.tableNumber,
      clientName: order.clientName,
      source: order.source,
      status: order.status,
      restaurantIds: [...new Set(order.items.map((item) => item.restaurantId))],
      totalAmount: order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt ?? order.createdAt
    };

    if (order.createdByUserId) {
      orderDoc.createdByUserId = order.createdByUserId;
    }

    if (order.clientDocumentId) {
      orderDoc.clientDocumentId = order.clientDocumentId;
    }

    if (order.closedAt) {
      orderDoc.closedAt = order.closedAt;
    }

    if (order.paymentMethod) {
      orderDoc.paymentMethod = order.paymentMethod;
    }

    if (order.paymentReference) {
      orderDoc.paymentReference = order.paymentReference;
    }

    if (typeof order.paymentAmountUsd === 'number') {
      orderDoc.paymentAmountUsd = order.paymentAmountUsd;
    }

    if (typeof order.paymentAmountBs === 'number') {
      orderDoc.paymentAmountBs = order.paymentAmountBs;
    }

    if (order.paymentVerificationStatus) {
      orderDoc.paymentVerificationStatus = order.paymentVerificationStatus;
    }

    if (order.paymentRequestedAt) {
      orderDoc.paymentRequestedAt = order.paymentRequestedAt;
    }

    if (order.paymentVerifiedAt) {
      orderDoc.paymentVerifiedAt = order.paymentVerifiedAt;
    }

    if (order.paymentVerifiedByUserId) {
      orderDoc.paymentVerifiedByUserId = order.paymentVerifiedByUserId;
    }

    if (order.paymentRejectedAt) {
      orderDoc.paymentRejectedAt = order.paymentRejectedAt;
    }

    if (order.paymentRejectedByUserId) {
      orderDoc.paymentRejectedByUserId = order.paymentRejectedByUserId;
    }

    if (order.cancelledAt) {
      orderDoc.cancelledAt = order.cancelledAt;
    }

    if (order.cancelledByUserId) {
      orderDoc.cancelledByUserId = order.cancelledByUserId;
    }

    return orderDoc;
  }

  private queueVerifiedPaymentNotifications(orders: Order[]): void {
    const currentUser = this.currentUser();
    if (!currentUser || currentUser.role !== 'MESONERO') {
      this.paymentVerificationNotifications.set([]);
      return;
    }

    const acknowledged = this.getAcknowledgedPaymentVerifications();
    const existing = new Set(this.paymentVerificationNotifications().map((item) => item.orderId));
    const queued = orders
      .filter((order) => order.createdByUserId === currentUser.id)
      .filter((order) => order.paymentVerificationStatus === 'VERIFICADO' && !!order.paymentVerifiedAt)
      .filter((order) => !acknowledged.includes(order.id) && !existing.has(order.id))
      .map((order) => ({
        orderId: order.id,
        title: 'Pago verificado',
        message: `Pago verificado para ${order.id} de la mesa ${formatTableNumberLabel(order.tableNumber, order.items.map((item) => item.restaurantId))} por $${(order.paymentAmountUsd ?? order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)).toFixed(2)}`
      }));

    if (!queued.length) {
      return;
    }

    this.paymentVerificationNotifications.update((items) => [...items, ...queued]);
  }

  private getAcknowledgedPaymentVerifications(): string[] {
    if (typeof window === 'undefined') {
      return [];
    }

    const currentUserId = this.currentUser()?.id;
    if (!currentUserId) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(`${PAYMENT_VERIFICATION_ACK_STORAGE_KEY}.${currentUserId}`);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private storeAcknowledgedPaymentVerification(orderId: string): void {
    if (typeof window === 'undefined') {
      return;
    }

    const currentUserId = this.currentUser()?.id;
    if (!currentUserId) {
      return;
    }

    const existing = new Set(this.getAcknowledgedPaymentVerifications());
    existing.add(orderId);
    window.localStorage.setItem(
      `${PAYMENT_VERIFICATION_ACK_STORAGE_KEY}.${currentUserId}`,
      JSON.stringify([...existing])
    );
  }

  private mapOrderItemToOrderItemDoc(orderId: string, item: Order['items'][number]): OrderItemDoc {
    const itemDoc: OrderItemDoc = {
      id: item.id,
      orderId,
      productId: item.productId,
      productName: item.productName,
      restaurantId: item.restaurantId,
      area: item.area,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.quantity * item.unitPrice,
      status: item.status,
      subItems: item.subItems,
      mainReady: item.mainReady,
      createdAt: item.createdAt ?? item.updatedAt ?? new Date().toISOString(),
      updatedAt: item.updatedAt ?? new Date().toISOString()
    };

    if (item.note) {
      itemDoc.note = item.note;
    }

    return Object.fromEntries(
      Object.entries(itemDoc).filter(([_, v]) => v !== undefined)
    ) as unknown as OrderItemDoc;
  }

  private getFromDate(period: 'DIARIO' | 'SEMANAL' | 'MENSUAL'): Date {
    const now = new Date();
    if (period === 'DIARIO') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (period === 'SEMANAL') {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  private nextItemId(): string {
    return `ITM-${crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`;
  }

  private nextProductId(): string {
    const maxId = this.products()
      .map((product) => Number(product.id.replace('P', '')))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, current) => Math.max(max, current), 0);

    return `P${maxId + 1}`;
  }

  private normalizeTipPercent(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.min(Math.max(value, 0), 100);
  }

  private normalizeBcvRate(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(value, 0);
  }

  private normalizeOrderNumber(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.trunc(value));
  }

  private normalizeOrderCounters(counters?: Partial<Record<OrderCounterKey, number>>): Partial<Record<OrderCounterKey, number>> {
    if (!counters) {
      return {};
    }

    const allowedKeys: OrderCounterKey[] = ['GLOBAL', 'PAPA_Y_SON'];
    return allowedKeys.reduce<Partial<Record<OrderCounterKey, number>>>((normalized, key) => {
      if (typeof counters[key] === 'number') {
        normalized[key] = this.normalizeOrderNumber(counters[key] ?? 0);
      }
      return normalized;
    }, {});
  }

  private getOrderCounterConfig(items: Array<{ restaurantId: RestaurantId }>): { counterKey: OrderCounterKey; prefix: string } {
    const restaurantIds = [...new Set(items.map((item) => item.restaurantId))];
    if (restaurantIds.length !== 1) {
      return { counterKey: 'GLOBAL', prefix: 'GLB' };
    }

    const restaurantId = restaurantIds[0];
    switch (restaurantId) {
      case 'PAPA_Y_SON':
        return { counterKey: restaurantId, prefix: 'PPS' };
      default:
        return { counterKey: 'GLOBAL', prefix: 'GLB' };
    }
  }
}
