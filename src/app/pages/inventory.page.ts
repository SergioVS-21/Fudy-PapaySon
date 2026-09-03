import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../core/app-state.service';
import { AreaId, InventoryArticle, InventoryMeasureUnit, Product, ProductBaseCategory, RestaurantId } from '../core/models';
import { InventoryMovementDoc } from '../core/firebase-models';

interface ProductCard extends Product {
  soldQuantity: number;
}

interface CategoryGroup {
  category: Product['category'];
  label: string;
  products: ProductCard[];
}

interface RestaurantSection {
  restaurantId: RestaurantId;
  restaurantName: string;
  products: ProductCard[];
  categories: CategoryGroup[];
}

type InventorySegment = 'MENU' | 'ARTICULOS';
type ArticleSortColumn = 'name' | 'restaurant' | 'unit' | 'quantity' | 'links';

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page">
      @if (!canAccessInventory()) {
        <article class="panel">
          <h2>Acceso restringido</h2>
          <p>Tu perfil no tiene permisos para ver Inventario.</p>
        </article>
      } @else {
      <header class="page-header">
        <h1>Inventario</h1>
      </header>

      <article class="panel segment-panel">
        <div class="segment-switch">
          <button type="button" class="segment-btn" [class.active]="activeSegment() === 'MENU'" (click)="activeSegment.set('MENU')">
            Menu
          </button>
          <button type="button" class="segment-btn" [class.active]="activeSegment() === 'ARTICULOS'" (click)="activeSegment.set('ARTICULOS')">
            Articulos
          </button>
        </div>
      </article>

      @if (activeSegment() === 'MENU') {
        <article class="panel head-panel">
          <div>
            <h2>Gestion de productos del menu</h2>
          </div>
          <button type="button" (click)="isAddModalOpen.set(true)">+ Agregar producto</button>
        </article>

        <section class="restaurant-sections">
          @for (section of productsByRestaurant(); track section.restaurantId) {
            <article class="panel section-panel">
              <div class="section-head">
                <h2>{{ section.restaurantName }}</h2>
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                  <span class="count-pill">{{ section.products.length }} productos</span>
                  <button type="button" class="btn-ghost" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" (click)="openCategoryManager(section.restaurantId)">Gestionar Categorias</button>
                </div>
              </div>

              <div class="category-groups">
                @if (isDataLoading() && !section.products.length) {
                  <article class="state-card">
                    <span class="state-spinner" aria-hidden="true"></span>
                    <strong>Cargando productos...</strong>
                  </article>
                } @else if (dataError() && !section.products.length) {
                  <article class="state-card">
                    <strong>{{ dataError() }}</strong>
                    <div class="state-actions-row">
                      <button type="button" class="btn-ghost state-retry-btn" (click)="retryLoad()">
                        <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
                        Reintentar
                      </button>
                      <button type="button" class="btn-ghost state-cancel-btn" (click)="cancelLoad()">
                        <i class="bi bi-x-circle" aria-hidden="true"></i>
                        Cancelar
                      </button>
                    </div>
                  </article>
                } @else {
                @for (group of section.categories; track group.category) {
                  <button type="button" class="category-block" (click)="openCategory(section.restaurantId, group.category)">
                    <div class="category-head">
                      <h3>{{ group.label }}</h3>
                      <span class="category-pill">{{ group.products.length }}</span>
                    </div>

                    <small class="category-caption">Click para ver productos</small>
                  </button>
                } @empty {
                  <p class="empty-state">No hay productos en este restaurante.</p>
                }
                }
              </div>
            </article>
          }
        </section>
      } @else {
        <article class="panel head-panel articles-head-panel">
          <div>
            <h2>Gestion de articulos</h2>
            <p class="summary">Vincula articulos a productos del menu para descontarlos automaticamente por venta.</p>
          </div>
          <button type="button" (click)="openArticleModal()">+ Agregar articulo</button>
        </article>

        <article class="panel articles-panel">
          <div class="table-toolbar">
            <label class="search-field">
              <span>Buscar articulo</span>
              <input
                type="text"
                [ngModel]="articleSearchQuery()"
                (ngModelChange)="articleSearchQuery.set($event || '')"
                placeholder="Ej: Carne de Hamburguesa"
              />
            </label>

            <div class="toolbar-meta">
              <span class="count-pill">{{ filteredArticles().length }} articulos</span>
            </div>
          </div>

          @if (isDataLoading() && !filteredArticles().length) {
            <article class="state-card">
              <span class="state-spinner" aria-hidden="true"></span>
              <strong>Cargando articulos...</strong>
            </article>
          } @else if (dataError() && !filteredArticles().length) {
            <article class="state-card">
              <strong>{{ dataError() }}</strong>
              <div class="state-actions-row">
                <button type="button" class="btn-ghost state-retry-btn" (click)="retryLoad()">
                  <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
                  Reintentar
                </button>
                <button type="button" class="btn-ghost state-cancel-btn" (click)="cancelLoad()">
                  <i class="bi bi-x-circle" aria-hidden="true"></i>
                  Cancelar
                </button>
              </div>
            </article>
          } @else {
            <div class="table-wrap">
              <table class="inventory-table">
                <thead>
                  <tr>
                    <th><button type="button" class="sort-btn" (click)="toggleArticleSort('name')">Nombre del item</button></th>
                    <th><button type="button" class="sort-btn" (click)="toggleArticleSort('restaurant')">Restaurante</button></th>
                    <th><button type="button" class="sort-btn" (click)="toggleArticleSort('unit')">Unidad</button></th>
                    <th><button type="button" class="sort-btn" (click)="toggleArticleSort('quantity')">Valor de medida</button></th>
                    <th><button type="button" class="sort-btn" (click)="toggleArticleSort('links')">Vinculaciones</button></th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (article of filteredArticles(); track article.id) {
                    <tr>
                      <td><strong>{{ article.name }}</strong></td>
                      <td>{{ restaurantLabel(article.restaurantId) }}</td>
                      <td>{{ article.unit }}</td>
                      <td>{{ article.quantity | number:'1.0-2' }}</td>
                      <td>
                        @if (article.linkedProducts.length) {
                          <div class="link-badges">
                            @for (link of article.linkedProducts; track link.productId) {
                              <span class="link-badge">{{ link.productName }} · {{ link.quantityPerSale | number:'1.0-2' }}</span>
                            }
                          </div>
                        } @else {
                          <span class="muted-cell">Sin vincular</span>
                        }
                      </td>
                      <td>
                        <button type="button" class="btn-ghost" (click)="openArticleModal(article)">Editar</button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6" class="empty-cell">No hay articulos cargados.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </article>
      }

      @if (isAddModalOpen()) {
        <div class="overlay" (click)="closeAddModal()">
          <article class="modal add-product-modal product-editor-modal" (click)="$event.stopPropagation()">
            <div class="product-modal-head">
              <h2>Agregar Producto</h2>
              <button type="button" class="modal-close" (click)="closeAddModal()" aria-label="Cerrar modal">×</button>
            </div>

            <div class="product-editor-layout">
              <article class="product-preview-card">
                <div class="product-preview-frame">
                  <small class="preview-caption">Vista Previa</small>
                  @if (newProductImagePreviewUrl()) {
                    <img class="product-preview-image" [src]="newProductImagePreviewUrl()" [alt]="newProduct.name || 'Imagen del producto'" />
                  } @else {
                    <div class="product-preview-placeholder">Sin imagen</div>
                  }

                  <div class="product-preview-copy">
                    <div class="product-preview-title-row">
                      <strong class="product-preview-name">{{ newProduct.name || 'Nuevo producto' }}</strong>
                      <span class="status-pill preview-status draft">Borrador</span>
                    </div>

                    @if (newProduct.description) {
                      <p class="draft-description">{{ newProduct.description }}</p>
                    }

                    <div class="product-preview-meta">
                      <span>{{ restaurantLabel(newProduct.restaurantId) }}</span>
                      <span>{{ areaLabel(newProduct.area) }}</span>
                      <span>{{ categoryLabel(newProduct.category) }}</span>
                    </div>

                    @if (newProduct.category.endsWith('_PROMOCION')) {
                      <div class="promotion-summary-chip">Incluye: {{ promotionCategorySummary(newProduct.promotionCategories) }}</div>
                    }

                    <div class="preview-metric-row">
                      <span>Precio: {{ newProduct.price }}</span>
                      <span>Stock inicial: {{ newProduct.stock }}</span>
                    </div>
                  </div>
                </div>
              </article>

              <form class="product-editor-form" (ngSubmit)="createProduct()">
                <label class="editor-field editor-field-full">
                  <span>Nombre del Producto</span>
                  <input type="text" [(ngModel)]="newProduct.name" name="name" placeholder="Ej: Cigarros Gold" required />
                </label>

                <label class="editor-field editor-field-full">
                  <span>Descripcion del producto</span>
                  <textarea [(ngModel)]="newProduct.description" name="description" rows="4" placeholder="Describe el producto para el equipo"></textarea>
                </label>

                <div class="editor-grid editor-grid-two">
                  <label class="editor-field">
                    <span>Restaurante</span>
                    <select [ngModel]="newProduct.restaurantId" (ngModelChange)="onRestaurantChange($event)" name="restaurantId">
                      @for (restaurant of allowedRestaurantOptions(); track restaurant.value) {
                        <option [value]="restaurant.value">{{ restaurant.label }}</option>
                      }
                    </select>
                  </label>

                  @if (isMultipleAreasAllowedForCategory(newProduct.category)) {
                    <div style="grid-column: 1 / -1; margin-top: 0.5rem;">
                      <h4 style="margin-top: 0; margin-bottom: 0.75rem; font-size: 0.82rem; color: #141414; font-weight: 700;">Componentes del Combo</h4>
                      @for (sub of newProduct.subItems; track $index) {
                        <div class="editor-field" style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem;">
                          <input type="text" [(ngModel)]="sub.name" [ngModelOptions]="{ standalone: true }" placeholder="Ej: 1 Cachapa" style="flex: 1;" />
                          <select [(ngModel)]="sub.area" [ngModelOptions]="{ standalone: true }" style="min-width: 130px;">
                            @for (area of areaOptionsForNewProduct(); track area.value) {
                              <option [value]="area.value">{{ area.label }}</option>
                            }
                          </select>
                          <button type="button" class="btn-ghost" style="color: #ff5e5e; font-weight: 800; font-size: 1.2rem; min-height: 56px; padding: 0 0.75rem;" (click)="newProduct.subItems.splice($index, 1)">×</button>
                        </div>
                      }
                      <button type="button" class="btn-ghost" style="font-size: 0.9rem; padding: 0.5rem 0; color: #887019; font-weight: 700; margin-top: 0.25rem;" (click)="newProduct.subItems.push({name: '', area: 'COCINA', quantity: 1})">+ Añadir componente</button>
                    </div>
                  } @else {
                    <label class="editor-field">
                      <span>Area</span>
                      <select [(ngModel)]="newProduct.area" name="area">
                        @for (area of areaOptionsForNewProduct(); track area.value) {
                          <option [value]="area.value">{{ area.label }}</option>
                        }
                      </select>
                    </label>
                  }
                </div>

                <div class="editor-grid editor-grid-two">
                  <label class="editor-field">
                    <span>Categoria</span>
                    <select [(ngModel)]="newProduct.category" name="category">
                      @for (category of categoriesForRestaurant(newProduct.restaurantId); track category.id) {
                        <option [value]="category.id">{{ category.name }}</option>
                      }
                    </select>
                  </label>

                  <label class="editor-field">
                    <span>Estado</span>
                    <select [ngModel]="true" name="draftAvailable" disabled>
                      <option [ngValue]="true">Disponible</option>
                    </select>
                  </label>
                </div>

                @if (newProduct.category === 'PROMOCION') {
                  <div class="promotion-selector-box">
                    @for (category of promotionBaseCategories; track category.value) {
                      <label class="promotion-check">
                        <span>{{ category.label }}</span>
                        <input
                          type="checkbox"
                          [checked]="newProduct.promotionCategories.includes(category.value)"
                          (change)="toggleNewPromotionCategory(category.value, $any($event.target).checked)"
                        />
                      </label>
                    }
                  </div>
                }

                <label class="editor-field image-picker-field editor-field-full">
                  <span>Imagen del Producto</span>
                  <div class="image-picker-row">
                    <label class="file-trigger">
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onProductImageSelected($event)" />
                      <span>Examinar</span>
                    </label>
                    <button type="button" class="secondary-action" (click)="removeNewProductImage()" [disabled]="!newProductImagePreviewUrl()">Quitar</button>
                  </div>
                </label>

                @if (productImageError()) {
                  <small class="image-error">{{ productImageError() }}</small>
                }

                <div class="editor-grid editor-grid-two price-stock-grid">
                  <label class="editor-field compact-control-field">
                    <span>Precio</span>
                    <input type="number" min="1" [(ngModel)]="newProduct.price" name="price" required />
                  </label>

                  <label class="editor-field compact-control-field">
                    <span>Stock</span>
                    <input type="number" min="0" [(ngModel)]="newProduct.stock" name="stock" required />
                  </label>
                </div>

                <button type="submit" class="primary-save-btn" [disabled]="!canCreateProduct() || isUploadingProductImage()">
                  {{ isUploadingProductImage() ? 'Subiendo imagen...' : 'Guardar Cambios' }}
                </button>
              </form>
            </div>
          </article>
        </div>
      }

      @if (selectedCategoryGroup()) {
        <div class="overlay" (click)="closeCategoryModal()">
          <article class="modal category-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>{{ selectedCategoryGroup()!.restaurantName }} - {{ selectedCategoryGroup()!.group.label }}</h2>
              <button type="button" class="btn-ghost" (click)="closeCategoryModal()">Cerrar</button>
            </div>

            <div class="cards-grid">
              @for (product of selectedCategoryGroup()!.group.products; track product.id) {
                <article class="inventory-card" [class.agotado]="!product.available">
                  @if (product.imageUrl) {
                    <img class="inventory-card-image" [src]="product.imageUrl" [alt]="product.name" loading="lazy" />
                  }
                  <div class="card-top">
                    <strong>{{ product.name }}</strong>
                    <span class="status-pill" [class.agotado]="!product.available">
                      {{ product.available ? 'Disponible' : 'Agotado' }}
                    </span>
                  </div>

                  <div class="card-body">
                    @if (product.description) {
                      <small class="product-description">{{ product.description }}</small>
                    }
                    <small>{{ product.area }} - {{ selectedCategoryGroup()!.group.label }}</small>
                    <small>Vendidas: {{ product.soldQuantity }}</small>
                  </div>

                  <div class="card-actions">
                    <button type="button" class="btn-ghost" (click)="openEditModal(product)">Editar producto</button>
                    <button type="button" class="btn-ghost" (click)="toggle(product.id, !product.available)">
                      {{ product.available ? 'Marcar agotado' : 'Marcar disponible' }}
                    </button>
                  </div>
                </article>
              } @empty {
                <p class="empty-state">Sin productos en esta categoria.</p>
              }
            </div>
          </article>
        </div>
      }

      @if (isEditModalOpen()) {
        <div class="overlay" (click)="closeEditModal()">
          <article class="modal add-product-modal product-editor-modal" (click)="$event.stopPropagation()">
            <div class="product-modal-head">
              <h2>Editar Producto</h2>
              <button type="button" class="modal-close" (click)="closeEditModal()" aria-label="Cerrar modal">×</button>
            </div>

            <div class="product-editor-layout">
              <article class="product-preview-card">
                <div class="product-preview-frame">
                  <small class="preview-caption">Vista Previa</small>
                  @if (editProductImagePreviewUrl()) {
                    <img class="product-preview-image" [src]="editProductImagePreviewUrl()" [alt]="editProduct.name || 'Imagen del producto'" />
                  } @else {
                    <div class="product-preview-placeholder">Sin imagen</div>
                  }

                  <div class="product-preview-copy">
                    <div class="product-preview-title-row">
                      <strong class="product-preview-name">{{ editProduct.name || 'Producto' }}</strong>
                      <span class="status-pill preview-status" [class.agotado]="!editProduct.available">
                        {{ editProduct.available ? 'Disponible' : 'Agotado' }}
                      </span>
                    </div>

                    @if (editProduct.description) {
                      <p class="draft-description">{{ editProduct.description }}</p>
                    }

                    <div class="preview-stat-pills">
                      <span>Vendidas: {{ soldByProduct().get(editProduct.id) ?? 0 }}</span>
                    </div>

                    <div class="preview-action-row">
                      <button type="button" class="mini-action gold" (click)="editProduct.available = !editProduct.available">
                        {{ editProduct.available ? 'Marcar agotado' : 'Marcar disponible' }}
                      </button>
                    </div>
                  </div>
                </div>
              </article>

              <form class="product-editor-form" (ngSubmit)="saveProductEdits()">
                <label class="editor-field editor-field-full">
                  <span>Nombre del Producto</span>
                  <input type="text" [(ngModel)]="editProduct.name" name="editName" required />
                </label>

                <label class="editor-field editor-field-full">
                  <span>Descripcion del producto</span>
                  <textarea [(ngModel)]="editProduct.description" name="editDescription" rows="4" placeholder="Describe el producto para el equipo"></textarea>
                </label>

                <div class="editor-grid editor-grid-two">
                  <label class="editor-field">
                    <span>Restaurante</span>
                    <select [ngModel]="editProduct.restaurantId" (ngModelChange)="onEditRestaurantChange($event)" name="editRestaurantId">
                      @for (restaurant of allowedRestaurantOptions(); track restaurant.value) {
                        <option [value]="restaurant.value">{{ restaurant.label }}</option>
                      }
                    </select>
                  </label>

                  @if (isMultipleAreasAllowedForCategory(editProduct.category)) {
                    <div style="grid-column: 1 / -1; margin-top: 0.5rem;">
                      <h4 style="margin-top: 0; margin-bottom: 0.75rem; font-size: 0.82rem; color: #141414; font-weight: 700;">Componentes del Combo</h4>
                      @for (sub of editProduct.subItems; track $index) {
                        <div class="editor-field" style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem;">
                          <input type="text" [(ngModel)]="sub.name" [ngModelOptions]="{ standalone: true }" placeholder="Ej: 1 Cachapa" style="flex: 1;" />
                          <select [(ngModel)]="sub.area" [ngModelOptions]="{ standalone: true }" style="min-width: 130px;">
                            @for (area of areaOptionsForEditProduct(); track area.value) {
                              <option [value]="area.value">{{ area.label }}</option>
                            }
                          </select>
                          <button type="button" class="btn-ghost" style="color: #ff5e5e; font-weight: 800; font-size: 1.2rem; min-height: 56px; padding: 0 0.75rem;" (click)="editProduct.subItems.splice($index, 1)">×</button>
                        </div>
                      }
                      <button type="button" class="btn-ghost" style="font-size: 0.9rem; padding: 0.5rem 0; color: #887019; font-weight: 700; margin-top: 0.25rem;" (click)="editProduct.subItems.push({name: '', area: 'COCINA', quantity: 1})">+ Añadir componente</button>
                    </div>
                  } @else {
                    <label class="editor-field">
                      <span>Area</span>
                      <select [(ngModel)]="editProduct.area" name="editArea">
                        @for (area of areaOptionsForEditProduct(); track area.value) {
                          <option [value]="area.value">{{ area.label }}</option>
                        }
                      </select>
                    </label>
                  }
                </div>

                <div class="editor-grid editor-grid-two">
                  <label class="editor-field">
                    <span>Categoria</span>
                    <select [(ngModel)]="editProduct.category" name="editCategory">
                      @for (category of categoriesForRestaurant(editProduct.restaurantId); track category.id) {
                        <option [value]="category.id">{{ category.name }}</option>
                      }
                    </select>
                  </label>

                  <label class="editor-field">
                    <span>Estado</span>
                    <select [(ngModel)]="editProduct.available" name="editAvailable">
                      <option [ngValue]="true">Disponible</option>
                      <option [ngValue]="false">Agotado</option>
                    </select>
                  </label>
                </div>

                 @if (editProduct.category.endsWith('_PROMOCION')) {
                  <div class="promotion-category-box">
                    <strong>Categorias incluidas en la promocion</strong>
                    <div class="promotion-category-grid">
                      @for (category of promotionBaseCategories; track category.value) {
                        <label class="promotion-category-option">
                          <input
                            type="checkbox"
                            [checked]="editProduct.promotionCategories.includes(category.value)"
                            (change)="toggleEditPromotionCategory(category.value, $any($event.target).checked)"
                          />
                          <span>{{ category.label }}</span>
                        </label>
                      }
                    </div>
                  </div>
                }

                <label class="editor-field image-picker-field editor-field-full">
                  <span>Imagen del Producto</span>
                  <div class="image-picker-row">
                    <label class="file-trigger">
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="onEditProductImageSelected($event)" />
                      <span>Examinar</span>
                    </label>
                    <button type="button" class="secondary-action" (click)="removeEditProductImage()" [disabled]="!editProductImagePreviewUrl()">Quitar</button>
                  </div>
                </label>

                @if (editProductImageError()) {
                  <small class="image-error">{{ editProductImageError() }}</small>
                }

                <div class="editor-grid editor-grid-two price-stock-grid">
                  <label class="editor-field compact-control-field">
                    <span>Precio</span>
                    <input type="number" min="0" [(ngModel)]="editProduct.price" name="editPrice" required />
                  </label>

                  <label class="editor-field compact-control-field">
                    <span>Stock</span>
                    <input type="number" min="0" [(ngModel)]="editProduct.stock" name="editStock" required />
                  </label>
                </div>

                <button type="submit" class="primary-save-btn" [disabled]="!canSaveEditedProduct() || isUploadingEditProductImage()">
                  {{ isUploadingEditProductImage() ? 'Guardando cambios...' : 'Guardar Cambios' }}
                </button>
              </form>
            </div>
          </article>
        </div>
      }

      @if (isArticleModalOpen()) {
        <div class="overlay" (click)="closeArticleModal()">
          <article class="modal article-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>{{ articleDraft.id ? 'Editar articulo' : 'Agregar articulo' }}</h2>
              <button type="button" class="btn-ghost" (click)="closeArticleModal()">Cerrar</button>
            </div>

            <form class="form-grid article-form" (ngSubmit)="saveArticle()">
              <div class="input-grid">
                <label>
                  Nombre del item
                  <input type="text" [(ngModel)]="articleDraft.name" name="articleName" required />
                </label>

                <label>
                  Restaurante
                  <select [ngModel]="articleDraft.restaurantId" (ngModelChange)="onArticleRestaurantChange($event)" name="articleRestaurantId">
                    @for (restaurant of allowedRestaurantOptions(); track restaurant.value) {
                      <option [value]="restaurant.value">{{ restaurant.label }}</option>
                    }
                  </select>
                </label>
              </div>

              <div class="input-grid">
                <label>
                  Unidad de medida
                  <select [(ngModel)]="articleDraft.unit" name="articleUnit">
                    @for (unit of articleUnits; track unit) {
                      <option [value]="unit">{{ unit }}</option>
                    }
                  </select>
                </label>

                <label>
                  Valor de esa medida
                  <div style="display: flex; gap: 8px;">
                    <input type="number" min="0" step="0.01" [(ngModel)]="articleDraft.quantity" name="articleQuantity" required style="flex: 1;" />
                    @if (articleDraft.id && articleDraft.restaurantId === 'PAPA_Y_SON') {
                      <div class="input-with-button" style="display: flex; gap: 4px;">
                        <input type="number" min="0.01" step="0.01" [ngModel]="restockAmount()" (ngModelChange)="restockAmount.set($event)" name="restockAmount" placeholder="Cant. a ingresar" style="width: 140px;" />
                        <button type="button" class="btn" (click)="onAddStock()" [disabled]="!restockAmount()">+ Ingresar</button>
                      </div>
                    }
                  </div>
                </label>
              </div>

              <article class="link-panel">
                <div class="link-panel-head">
                  <div>
                    <h3>Vinculacion con menu</h3>
                    <p>Selecciona los productos del menu que deben descontar este articulo cuando se vendan.</p>
                  </div>
                  <button type="button" class="btn-ghost" (click)="openLinkModal()">Abrir menu y vincular</button>
                </div>

                <div class="table-wrap">
                  <table class="inventory-table inventory-table--compact">
                    <thead>
                      <tr>
                        <th>Producto del menu</th>
                        <th>Cantidad a descontar</th>
                        <th>Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (link of articleLinks(); track link.productId) {
                        <tr>
                          <td>{{ link.productName }}</td>
                          <td>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              [ngModel]="link.quantityPerSale"
                              (ngModelChange)="updateArticleLinkQuantity(link.productId, $event)"
                              [ngModelOptions]="{ standalone: true }"
                            />
                          </td>
                          <td>
                            <button type="button" class="btn-ghost" (click)="removeArticleLink(link.productId)">Quitar</button>
                          </td>
                        </tr>
                      }
                      @if (articleLinks().length === 0) {
                        <tr>
                          <td colspan="3" style="text-align: center">No hay vinculaciones</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </article>

              @if (articleDraft.id && articleDraft.restaurantId === 'PAPA_Y_SON') {
                <article class="link-panel" style="margin-top: 1rem;">
                  <div class="link-panel-head">
                    <div>
                      <h3>Historial de Ingresos</h3>
                      <p>Ultimos ingresos de stock para este articulo.</p>
                    </div>
                  </div>
                  <div class="table-wrap">
                    <table class="inventory-table inventory-table--compact">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Usuario</th>
                          <th>Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (mov of articleMovements(); track mov.id) {
                          <tr>
                            <td>{{ formatMovementDate(mov.createdAt) }}</td>
                            <td>{{ getCreatorName(mov.createdByUserId) }}</td>
                            <td><span style="color: #2e7d32; font-weight: bold;">+{{ mov.quantity }} {{ articleDraft.unit }}</span></td>
                          </tr>
                        }
                        @if (articleMovements().length === 0) {
                          <tr>
                            <td colspan="3" style="text-align: center;">No hay ingresos registrados</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </article>
              }

              <button type="submit" [disabled]="!canSaveArticle()">{{ articleDraft.id ? 'Guardar cambios' : 'Guardar articulo' }}</button>
            </form>
          </article>
        </div>
      }

      @if (isLinkModalOpen()) {
        <div class="overlay" (click)="closeLinkModal()">
          <article class="modal link-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h2>Vincular articulo con menu</h2>
              <button type="button" class="btn-ghost" (click)="closeLinkModal()">Cerrar</button>
            </div>

            <label class="search-field">
              <span>Buscar producto del menu</span>
              <input type="text" [ngModel]="linkSearchQuery()" (ngModelChange)="linkSearchQuery.set($event || '')" placeholder="Ej: Hamburguesa" />
            </label>

            <div class="table-wrap">
              <table class="inventory-table inventory-table--compact">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoria</th>
                    <th>Area</th>
                    <th>Descuento por venta</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  @for (product of linkableMenuProducts(); track product.id) {
                    <tr>
                      <td>{{ product.name }}</td>
                      <td>{{ categoryLabel(product.category) }}</td>
                      <td>{{ areaLabel(product.area) }}</td>
                      <td>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          [ngModel]="linkDraftQuantity(product.id)"
                          (ngModelChange)="updateLinkDraftQuantity(product.id, $event)"
                          [ngModelOptions]="{ standalone: true }"
                        />
                      </td>
                      <td>
                        <button type="button" class="btn-ghost" (click)="attachProductLink(product)">
                          {{ isLinkedProduct(product.id) ? 'Actualizar' : 'Vincular' }}
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="empty-cell">No hay productos del menu para este restaurante.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </article>
        </div>
      }

      @if (isCategoryManagerOpen()) {
        <div class="overlay" (click)="closeCategoryManager()">
          <article class="modal" (click)="$event.stopPropagation()" style="width: min(500px, 100%);">
            <div class="modal-head">
              <h2>Gestionar Categorias - {{ restaurantLabel(activeCategoryManagerRestaurantId()!) }}</h2>
              <button type="button" class="btn-ghost" (click)="closeCategoryManager()">Cerrar</button>
            </div>

            <form class="article-form" (ngSubmit)="addCategory()" style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
              <div style="display: flex; gap: 0.5rem; width: 100%;">
                <input
                  type="text"
                  [(ngModel)]="newCategoryName"
                  name="newCategoryName"
                  placeholder="Ej. Postres"
                  style="flex: 1; min-height: 40px; border-radius: 0.8rem; border: 1px solid #dbe2ff; padding: 0.5rem;"
                  required
                />
                <button type="submit" [disabled]="newCategoryName.trim().length < 2" style="min-width: 90px;">Agregar</button>
              </div>
              @if (activeCategoryManagerRestaurantId() === 'PAPA_Y_SON') {
                <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: #505050; width: 100%;">
                  <input type="checkbox" [(ngModel)]="newCategoryAllowMultipleAreas" name="newCategoryAllowMultipleAreas" />
                  Permitir combos (Múltiples áreas)
                </label>
              }
            </form>

            <div class="category-list" style="display: grid; gap: 0.55rem; max-height: 40vh; overflow-y: auto; margin-top: 1rem; padding-right: 0.25rem;">
              @for (cat of categoriesForRestaurant(activeCategoryManagerRestaurantId()!); track cat.id) {
                <div class="category-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; border: 1px solid #edf1ff; border-radius: 0.8rem; background: #fcfdff;">
                  @if (editingCategoryId() === cat.id) {
                    <div style="flex: 1;">
                      <input
                        type="text"
                        [(ngModel)]="editingCategoryName"
                        [ngModelOptions]="{ standalone: true }"
                        style="width: 100%; min-height: 36px; border-radius: 0.6rem; border: 2px solid #7bcf8f; padding: 0.4rem;"
                      />
                      @if (activeCategoryManagerRestaurantId() === 'PAPA_Y_SON') {
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; margin-top: 0.25rem;">
                          <input type="checkbox" [(ngModel)]="editingCategoryAllowMultipleAreas" [ngModelOptions]="{ standalone: true }" />
                          Permitir combos
                        </label>
                      }
                    </div>
                    <div style="display: flex; gap: 0.25rem; margin-left: 0.5rem;">
                      <button type="button" class="btn-ghost" style="padding: 0.25rem 0.5rem;" (click)="saveCategoryEdit(cat.id)">Guardar</button>
                      <button type="button" class="btn-ghost" style="padding: 0.25rem 0.5rem; color: #ff5e5e;" (click)="cancelCategoryEdit()">Cancelar</button>
                    </div>
                  } @else {
                    <div>
                      <span style="font-weight: 700; color: #40486d;">{{ cat.name }}</span>
                      @if (cat.allowMultipleAreas) {
                        <span style="font-size: 0.7rem; background: #e0e7ff; color: #4a6ee0; padding: 0.1rem 0.4rem; border-radius: 0.4rem; margin-left: 0.5rem;">Combos</span>
                      }
                    </div>
                    <div style="display: flex; gap: 0.25rem;">
                      <button type="button" class="btn-ghost" style="padding: 0.25rem 0.5rem;" (click)="startCategoryEdit(cat)">Editar nombre</button>
                      <button type="button" class="btn-ghost" style="padding: 0.25rem 0.5rem; color: #ff5e5e;" (click)="deleteCategory(cat.id)" [title]="isCategoryInUse(cat.id) ? 'Eliminar esta categoría y sus productos asociados' : ''">Eliminar</button>
                    </div>
                  }
                </div>
              }
            </div>
          </article>
        </div>
      }

      @if (isConfirmCategoryEditOpen()) {
        <div class="overlay" (click)="closeConfirmCategoryEdit()">
          <article class="modal" (click)="$event.stopPropagation()" style="width: min(420px, 100%);">
            <div class="modal-head">
              <h2>Confirmar Cambios</h2>
              <button type="button" class="btn-ghost" (click)="closeConfirmCategoryEdit()">✕</button>
            </div>
            <div style="padding: 1rem 0; display: grid; gap: 1rem;">
              <p style="margin: 0; color: #40486d; line-height: 1.5;">
                ¿Estás seguro de cambiar el nombre de la categoría de 
                <strong>"{{ categoryEditTargetOldName() }}"</strong> a 
                <strong>"{{ categoryEditTargetNewName() }}"</strong>?
              </p>
              <div style="background: #fff9e6; border: 1px solid #ffe89e; border-radius: 0.8rem; padding: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1.25rem;">⚠️</span>
                <span style="font-size: 0.9rem; color: #856404; font-weight: 600;">
                  Se actualizará automáticamente la categoría en <strong>{{ categoryEditAffectedCount() }}</strong> producto(s).
                </span>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
              <button type="button" class="btn-ghost" (click)="closeConfirmCategoryEdit()">Cancelar</button>
              <button type="button" (click)="confirmCategoryEdit()" style="background: #7bcf8f; color: white; border: none; border-radius: 0.8rem; padding: 0.5rem 1rem; font-weight: 700; cursor: pointer;">
                Confirmar
              </button>
            </div>
          </article>
        </div>
      }
      }
    </section>
  `,
  styles: `
    .segment-panel {
      padding-bottom: 0.5rem;
    }

    .segment-switch {
      display: inline-grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid #dbe2ff;
      border-radius: 999px;
      padding: 0.22rem;
      background: #f6f9ff;
      gap: 0.25rem;
    }

    .segment-btn {
      border: none;
      background: transparent;
      color: #4f5a88;
      border-radius: 999px;
      padding: 0.45rem 0.95rem;
      font-weight: 800;
    }

    .segment-btn.active {
      background: linear-gradient(135deg, #ffd84d 0%, #a17e11 100%);
      color: #ffffff;
    }

    .head-panel {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.8rem;
    }

    .articles-head-panel {
      align-items: end;
    }

    .summary {
      margin: 0.3rem 0 0;
      color: #6e769a;
    }

    .restaurant-sections {
      display: grid;
      gap: 0.85rem;
    }

    .section-panel {
      display: grid;
      gap: 0.7rem;
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .section-head h2 {
      margin: 0;
      font-size: 1.05rem;
      color: #40486d;
    }

    .count-pill {
      background: #edf1ff;
      color: #525a88;
      border: 1px solid #dbe2ff;
      border-radius: 999px;
      padding: 0.18rem 0.55rem;
      font-size: 0.76rem;
      font-weight: 700;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 0.7rem;
    }

    .category-groups {
      display: grid;
      gap: 0.8rem;
    }

    .category-block {
      display: grid;
      gap: 0.55rem;
      width: 100%;
      border: 1px solid #dbe2ff;
      border-radius: 0.8rem;
      padding: 0.5rem;
      background: #f8f9ff;
      text-align: left;
    }

    .category-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.6rem;
      padding: 0.15rem 0.2rem;
      border-radius: 0.7rem;
    }

    .category-caption {
      color: #727aa0;
      font-size: 0.78rem;
      padding: 0 0.2rem 0.15rem;
    }

    .category-head h3 {
      margin: 0;
      font-size: 0.9rem;
      color: #4c5684;
    }

    .category-pill {
      background: #e7ebff;
      color: #4f5a88;
      border-radius: 999px;
      padding: 0.15rem 0.5rem;
      font-size: 0.72rem;
      font-weight: 700;
    }

    .inventory-card {
      border-radius: 0.95rem;
      border: 1px solid #bceacb;
      background: linear-gradient(140deg, #f3fff7 0%, #e8ffef 100%);
      padding: 0.75rem;
      display: grid;
      gap: 0.6rem;
    }

    .inventory-card-image {
      width: 100%;
      height: 120px;
      object-fit: cover;
      border-radius: 0.75rem;
      border: 1px solid rgba(59, 87, 150, 0.2);
      background: #ffffff;
    }

    .inventory-card.agotado {
      border-color: #ffd9be;
      background: linear-gradient(140deg, #fff8f2 0%, #fff1e6 100%);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.6rem;
    }

    .card-body {
      display: grid;
      gap: 0.2rem;
    }

    .card-body small {
      color: #70789a;
    }

    .product-description,
    .draft-description {
      margin: 0;
      color: #5c678f;
      line-height: 1.4;
    }

    .status-pill {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      border: 1px solid #bceacb;
      background: #daf9e4;
      color: #2f7a48;
    }

    .status-pill.agotado {
      background: #ffe7d3;
      color: #a86035;
      border-color: #ffd2b1;
    }

    .empty-state {
      margin: 0;
      color: #6e769a;
      padding: 0.7rem;
      border-radius: 0.75rem;
      background: #f7f9ff;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(34, 42, 78, 0.48);
      backdrop-filter: blur(3px);
      display: grid;
      place-items: center;
      padding: 1rem;
      z-index: 200;
    }

    .modal {
      width: min(600px, 100%);
      max-height: 92vh;
      overflow: auto;
      background: #ffffff;
      border: 1px solid #e5eaff;
      border-radius: 1rem;
      padding: 1rem;
      display: grid;
      gap: 0.9rem;
    }

    .add-product-modal,
    .article-modal,
    .link-modal {
      width: min(980px, 100%);
    }

    .product-editor-modal {
      width: min(1080px, 100%);
      border-radius: 1.8rem;
      border: 1px solid #ececec;
      padding: 1.6rem 1.8rem 1.75rem;
      box-shadow: 0 32px 70px rgba(40, 35, 12, 0.18);
    }

    .product-modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.8rem;
    }

    .product-modal-head h2 {
      margin: 0;
      font-size: clamp(1.9rem, 3vw, 2.3rem);
      color: #111111;
      font-weight: 900;
      letter-spacing: -0.03em;
    }

    .modal-close {
      border: none;
      background: transparent;
      color: #111111;
      font-size: 3rem;
      line-height: 1;
      width: 3rem;
      height: 3rem;
      padding: 0;
    }

    .product-editor-layout {
      display: grid;
      grid-template-columns: 290px 1fr;
      gap: 1.2rem;
      align-items: start;
    }

    .product-preview-frame {
      border: 4px solid #dddddd;
      border-radius: 1.45rem;
      padding: 0.9rem;
      background: #ffffff;
      display: grid;
      gap: 0.8rem;
    }

    .preview-caption {
      color: #2d2d2d;
      font-size: 0.86rem;
      font-weight: 700;
    }

    .product-preview-image,
    .product-preview-placeholder {
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 1rem;
      border: 1px solid #d4d4d4;
      background: #f7f7f7;
      object-fit: cover;
      display: grid;
      place-items: center;
      color: #7a7a7a;
      font-weight: 700;
    }

    .product-preview-copy {
      display: grid;
      gap: 0.65rem;
    }

    .product-preview-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .product-preview-name {
      font-size: 1rem;
      color: #111111;
      line-height: 1.1;
    }

    .preview-status.draft {
      border-color: #d7d7d7;
      background: #f3f3f3;
      color: #666666;
    }

    .product-preview-meta,
    .preview-stat-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .product-preview-meta span,
    .preview-stat-pills span,
    .promotion-summary-chip {
      border-radius: 999px;
      padding: 0.24rem 0.6rem;
      background: #f3f3f3;
      border: 1px solid #dddddd;
      color: #3b3b3b;
      font-size: 0.72rem;
      font-weight: 700;
    }

    .preview-metric-row {
      display: grid;
      gap: 0.35rem;
      color: #464646;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .preview-action-row {
      display: flex;
      gap: 0.55rem;
      flex-wrap: wrap;
    }

    .mini-action,
    .secondary-action {
      min-height: 40px;
      border-radius: 0.85rem;
      border: 1px solid #d2d2d2;
      background: #ffffff;
      color: #1f1f1f;
      padding: 0.45rem 0.9rem;
      font: inherit;
      font-weight: 700;
    }

    .mini-action.gold {
      background: linear-gradient(180deg, #cfa523 0%, #b98c0d 100%);
      border-color: #aa8009;
      color: #fffdf7;
    }

    .product-editor-form {
      display: grid;
      gap: 0.95rem;
    }

    .editor-grid {
      display: grid;
      gap: 0.8rem;
    }

    .editor-grid-two {
      grid-template-columns: 1fr 1fr;
    }

    .editor-field {
      display: grid;
      gap: 0.35rem;
      color: #141414;
      font-weight: 700;
    }

    .editor-field span {
      font-size: 0.82rem;
    }

    .editor-field input,
    .editor-field textarea,
    .editor-field select {
      min-height: 56px;
      border-radius: 1.2rem;
      border: 4px solid #d9d9d9;
      background: #ffffff;
      padding: 0.8rem 0.95rem;
      color: #202020;
      font: inherit;
      resize: vertical;
    }

    .editor-field textarea {
      min-height: 132px;
    }

    .editor-field input:focus,
    .editor-field textarea:focus,
    .editor-field select:focus {
      outline: none;
      border-color: #c8c8c8;
      box-shadow: 0 0 0 3px rgba(210, 210, 210, 0.28);
    }

    .editor-field-full {
      grid-column: 1 / -1;
    }

    .promotion-selector-box {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.5rem;
      border: 4px solid #d9d9d9;
      border-radius: 1.2rem;
      padding: 0.75rem 0.9rem;
      background: #ffffff;
    }

    .promotion-check {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.65rem;
      color: #222222;
      font-weight: 700;
    }

    .promotion-check input {
      width: 18px;
      height: 18px;
      min-height: 18px;
      padding: 0;
    }

    .image-picker-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .file-trigger {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      min-width: 150px;
      border-radius: 0.8rem;
      border: 1px solid #d2d2d2;
      background: #ffffff;
      padding: 0.45rem 0.9rem;
      color: #1f1f1f;
      font-weight: 700;
      overflow: hidden;
      cursor: pointer;
    }

    .file-trigger input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }

    .price-stock-grid {
      max-width: 560px;
    }

    .compact-control-field input {
      min-height: 48px;
    }

    .primary-save-btn {
      min-height: 54px;
      border-radius: 999px;
      border: none;
      background: linear-gradient(180deg, #ffd84d 0%, #a17e11 100%);
      color: #ffffff;
      font-size: 1rem;
      font-weight: 800;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
    }

    .add-product-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 0.9rem;
      align-items: start;
    }

    .draft-card {
      aspect-ratio: 1 / 1;
      border: 1px solid #d9e2ff;
      border-radius: 1rem;
      padding: 0.85rem;
      background: linear-gradient(135deg, #f6f9ff 0%, #eef3ff 100%);
      display: grid;
      gap: 0.65rem;
      align-content: start;
    }

    .draft-label {
      color: #6e769a;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      font-size: 0.72rem;
    }

    .draft-name {
      color: #374168;
      font-size: 1.1rem;
      line-height: 1.2;
    }

    .draft-image {
      width: 100%;
      max-height: 140px;
      object-fit: cover;
      border-radius: 0.85rem;
      border: 1px solid #d6dfff;
      background: #ffffff;
    }

    .draft-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .draft-tags span {
      border-radius: 999px;
      border: 1px solid #d4ddff;
      background: #ffffff;
      color: #56608a;
      padding: 0.16rem 0.5rem;
      font-size: 0.74rem;
      font-weight: 700;
    }

    .draft-metrics {
      margin-top: auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
    }

    .draft-metrics > div {
      border: 1px solid #d7e0ff;
      border-radius: 0.75rem;
      background: #ffffff;
      padding: 0.55rem;
      display: grid;
      gap: 0.15rem;
    }

    .draft-metrics small {
      color: #6b7398;
      font-size: 0.72rem;
    }

    .draft-metrics strong {
      color: #34406c;
      font-size: 1rem;
    }

    .add-product-form,
    .article-form {
      display: grid;
      gap: 0.75rem;
    }

    .add-product-form textarea,
    .article-form textarea,
    .table-toolbar input,
    .search-field input,
    .inventory-table input {
      min-height: 44px;
      border-radius: 0.8rem;
      border: 1px solid #d8e4ff;
      background: #fff;
      padding: 0.68rem 0.75rem;
      font-size: 0.94rem;
      color: #2a355d;
      resize: vertical;
      font-family: inherit;
    }

    .add-product-form textarea:focus,
    .article-form textarea:focus,
    .table-toolbar input:focus,
    .search-field input:focus,
    .inventory-table input:focus {
      outline: none;
      border-color: #7bcf8f;
      box-shadow: 0 0 0 3px rgba(123, 207, 143, 0.24);
    }

    .input-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.7rem;
    }

    .promotion-category-box {
      border: 1px solid #d9e2ff;
      border-radius: 0.85rem;
      background: #f8faff;
      padding: 0.7rem 0.75rem;
      display: grid;
      gap: 0.55rem;
    }

    .promotion-category-box strong {
      color: #44507d;
      font-size: 0.9rem;
    }

    .promotion-category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.45rem;
    }

    .promotion-category-option {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.45rem 0.55rem;
      border-radius: 0.7rem;
      border: 1px solid #d8e2ff;
      background: #ffffff;
      color: #4c5684;
      font-size: 0.84rem;
      font-weight: 700;
    }

    .category-modal {
      width: min(900px, 100%);
    }

    .restock-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.5rem;
      align-items: end;
    }

    .restock-row label {
      font-size: 0.78rem;
      color: #677197;
    }

    .restock-row button {
      min-width: 96px;
    }

    .card-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .image-actions {
      display: flex;
      justify-content: flex-start;
    }

    .image-error {
      color: #b24747;
      font-weight: 700;
      font-size: 0.78rem;
      margin-top: -0.2rem;
    }

    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.7rem;
    }

    .articles-panel,
    .link-panel {
      display: grid;
      gap: 0.9rem;
    }

    .table-toolbar,
    .link-panel-head {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 0.8rem;
      flex-wrap: wrap;
    }

    .search-field {
      display: grid;
      gap: 0.35rem;
      min-width: min(100%, 340px);
    }

    .toolbar-meta {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .table-wrap {
      overflow: auto;
      border: 1px solid #dce3f2;
      border-radius: 1rem;
      background: #ffffff;
    }

    .inventory-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }

    .inventory-table th,
    .inventory-table td {
      padding: 0.85rem 0.9rem;
      border-bottom: 1px solid #edf1ff;
      text-align: left;
      vertical-align: top;
    }

    .inventory-table thead th {
      background: #f8fbff;
      color: #44507d;
      font-size: 0.83rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .inventory-table tbody tr:hover {
      background: #f9fff9;
    }

    .inventory-table--compact {
      min-width: 640px;
    }

    .sort-btn {
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 800;
      padding: 0;
      cursor: pointer;
    }

    .link-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .link-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.18rem 0.5rem;
      background: #edf9f0;
      color: #2f7a48;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .muted-cell,
    .empty-cell,
    .link-panel-head p {
      color: #6e769a;
    }

    .empty-cell {
      text-align: center;
    }

    .link-panel-head h3,
    .link-panel-head p {
      margin: 0;
    }

    @media (max-width: 760px) {
      .head-panel,
      .section-head,
      .table-toolbar,
      .link-panel-head,
      .modal-head {
        display: grid;
      }

      .add-product-layout,
      .product-editor-layout,
      .input-grid,
      .card-actions,
      .editor-grid-two,
      .promotion-selector-box {
        grid-template-columns: 1fr;
      }

      .product-editor-modal {
        padding: 1rem;
      }

      .product-modal-head h2 {
        font-size: 1.6rem;
      }

      .modal-close {
        width: 2.4rem;
        height: 2.4rem;
        font-size: 2.2rem;
      }

      .image-picker-row,
      .preview-action-row {
        display: grid;
      }

      .draft-card {
        aspect-ratio: auto;
      }
    }
  `
})
export class InventoryPageComponent {
  private readonly state = inject(AppStateService);
  private readonly allAreaOptions: Array<{ value: AreaId; label: string }> = [
    { value: 'COCINA', label: 'Cocina' },
    { value: 'GRILL', label: 'Grill' },
    { value: 'BARRA', label: 'Barra' },
    { value: 'PIZZERIA', label: 'Pizzeria' },
    { value: 'CAJA', label: 'Caja' }
  ];

  readonly articleUnits: InventoryMeasureUnit[] = ['KG', 'UND', 'LTRS'];
  readonly promotionBaseCategories: Array<{ value: ProductBaseCategory; label: string }> = [
    { value: 'COMIDA', label: 'Comida' },
    { value: 'BEBIDA', label: 'Bebida' },
    { value: 'PIZZA', label: 'Pizza' },
    { value: 'MOSTRADOR', label: 'Mostrador' }
  ];
  readonly isDataLoading = computed(() => this.state.runtimeDataLoading());
  readonly dataError = computed(() => this.state.runtimeDataError());
  readonly canAccessInventory = computed(() => this.state.canAccessModule('inventario'));
  readonly activeSegment = signal<InventorySegment>('MENU');
  readonly articleSearchQuery = signal('');
  readonly articleSortColumn = signal<ArticleSortColumn>('name');
  readonly articleSortDirection = signal<'asc' | 'desc'>('asc');

  readonly allowedRestaurantOptions = computed(() =>
    this.state.allowedRestaurantIds().map((restaurantId) => ({
      value: restaurantId,
      label: this.restaurantLabel(restaurantId)
    }))
  );

  readonly isAddModalOpen = signal(false);
  readonly isEditModalOpen = signal(false);
  readonly isArticleModalOpen = signal(false);
  readonly isLinkModalOpen = signal(false);
  readonly isCategoryManagerOpen = signal(false);
  readonly isConfirmCategoryEditOpen = signal(false);
  readonly categoryEditTargetId = signal<string | null>(null);
  readonly categoryEditTargetNewName = signal<string>('');
  readonly categoryEditTargetOldName = signal<string>('');
  readonly categoryEditTargetAllowMultipleAreas = signal<boolean>(false);
  readonly categoryEditAffectedCount = signal<number>(0);
  readonly activeCategoryManagerRestaurantId = signal<RestaurantId | null>(null);
  newCategoryName = '';
  newCategoryAllowMultipleAreas = false;
  readonly editingCategoryId = signal<string | null>(null);
  editingCategoryName = '';
  editingCategoryAllowMultipleAreas = false;
  readonly productCategories = computed(() => this.state.productCategories());
  readonly selectedCategoryRef = signal<{ restaurantId: RestaurantId; category: Product['category'] } | null>(null);
  readonly newProductImageFile = signal<File | null>(null);
  readonly newProductImagePreviewUrl = signal('');
  readonly isUploadingProductImage = signal(false);
  readonly productImageError = signal('');
  readonly editProductImageFile = signal<File | null>(null);
  readonly editProductImagePreviewUrl = signal('');
  readonly isUploadingEditProductImage = signal(false);
  readonly editProductImageError = signal('');
  readonly editProductImageRemoved = signal(false);

  isMultipleAreasAllowedForCategory(categoryId: string): boolean {
    const cat = this.productCategories().find(c => c.id === categoryId);
    return cat ? !!cat.allowMultipleAreas : false;
  }

  readonly restockDraftByProduct = signal<Record<string, number>>({});
  readonly articleLinks = signal<InventoryArticle['linkedProducts']>([]);
  readonly linkSearchQuery = signal('');
  readonly linkQuantityDrafts = signal<Record<string, number>>({});
  readonly restockAmount = signal<number | null>(null);
  readonly articleMovements = signal<InventoryMovementDoc[]>([]);

  readonly newProduct = {
    name: '',
    description: '',
    restaurantId: 'LA_PALMERA' as RestaurantId,
    area: 'COCINA' as AreaId,
    category: 'COMIDA' as Product['category'],
    promotionCategories: [] as ProductBaseCategory[],
    price: 1,
    stock: 0,
    subItems: [] as import('../core/models').ProductSubItem[]
  };

  readonly editProduct = {
    id: '',
    name: '',
    description: '',
    restaurantId: 'LA_PALMERA' as RestaurantId,
    area: 'COCINA' as AreaId,
    category: 'COMIDA' as Product['category'],
    promotionCategories: [] as ProductBaseCategory[],
    imageUrl: '' as string | undefined,
    price: 1,
    stock: 0,
    available: true,
    subItems: [] as import('../core/models').ProductSubItem[]
  };

  readonly articleDraft = {
    id: '',
    name: '',
    restaurantId: 'LA_PALMERA' as RestaurantId,
    unit: 'UND' as InventoryMeasureUnit,
    quantity: 0
  };

  constructor() {
    const firstRestaurant = this.state.allowedRestaurantIds()[0];
    if (firstRestaurant) {
      this.newProduct.restaurantId = firstRestaurant;
      this.newProduct.category = `${firstRestaurant}_COMIDA`;
      this.editProduct.restaurantId = firstRestaurant;
      this.editProduct.category = `${firstRestaurant}_COMIDA`;
      this.articleDraft.restaurantId = firstRestaurant;
    }
  }

  readonly soldByProduct = computed(() => {
    const map = new Map<string, number>();

    this.state.getVisibleOrdersForModule('inventario').forEach((order) => {
      order.items.forEach((item) => {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      });
    });

    return map;
  });

  readonly productsByRestaurant = computed<RestaurantSection[]>(() => {
    const soldMap = this.soldByProduct();
    const products = this.state.getVisibleProducts().map((product) => ({
      ...product,
      soldQuantity: soldMap.get(product.id) ?? 0
    }));

    const categories = this.state.productCategories().map((c) => ({
      value: c.id,
      label: c.name,
      restaurantId: c.restaurantId
    }));

    const buildCategories = (restaurantId: RestaurantId): CategoryGroup[] =>
      categories
        .filter((category) => category.restaurantId === restaurantId)
        .map((category) => ({
          category: category.value,
          label: category.label,
          products: products.filter(
            (product) => product.restaurantId === restaurantId && product.category === category.value
          )
        }));

    return this.state.allowedRestaurantIds().map((restaurantId) => ({
      restaurantId,
      restaurantName: this.restaurantLabel(restaurantId),
      products: products.filter((product) => product.restaurantId === restaurantId),
      categories: buildCategories(restaurantId)
    }));
  });

  readonly selectedCategoryGroup = computed(() => {
    const selected = this.selectedCategoryRef();
    if (!selected) {
      return null;
    }

    const section = this.productsByRestaurant().find((item) => item.restaurantId === selected.restaurantId);
    const group = section?.categories.find((item) => item.category === selected.category);
    if (!section || !group) {
      return null;
    }

    return {
      restaurantName: section.restaurantName,
      group
    };
  });

  readonly filteredArticles = computed(() => {
    const query = this.articleSearchQuery().trim().toLowerCase();
    const sortColumn = this.articleSortColumn();
    const sortDirection = this.articleSortDirection();
    const factor = sortDirection === 'asc' ? 1 : -1;

    return this.state
      .getVisibleInventoryArticles()
      .filter((article) => {
        if (!query) {
          return true;
        }

        const haystack = [
          article.name,
          this.restaurantLabel(article.restaurantId),
          article.unit,
          ...article.linkedProducts.map((link) => link.productName)
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice()
      .sort((left, right) => {
        if (sortColumn === 'quantity') {
          return (left.quantity - right.quantity) * factor;
        }

        if (sortColumn === 'links') {
          return (left.linkedProducts.length - right.linkedProducts.length) * factor;
        }

        const leftValue =
          sortColumn === 'restaurant'
            ? this.restaurantLabel(left.restaurantId)
            : sortColumn === 'unit'
              ? left.unit
              : left.name;

        const rightValue =
          sortColumn === 'restaurant'
            ? this.restaurantLabel(right.restaurantId)
            : sortColumn === 'unit'
              ? right.unit
              : right.name;

        return leftValue.localeCompare(rightValue) * factor;
      });
  });

  readonly linkableMenuProducts = computed(() => {
    const query = this.linkSearchQuery().trim().toLowerCase();
    return this.state
      .getVisibleProducts()
      .filter((product) => product.restaurantId === this.articleDraft.restaurantId)
      .filter((product) => {
        if (!query) {
          return true;
        }

        return [product.name, product.category, this.areaLabel(product.area)].join(' ').toLowerCase().includes(query);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  retryLoad(): void {
    void this.state.retryRuntimeDataLoad();
  }

  cancelLoad(): void {
    this.state.clearRuntimeDataError();
  }

  toggle(productId: string, available: boolean): void {
    this.state.setProductAvailability(productId, available);
  }

  openCategory(restaurantId: RestaurantId, category: Product['category']): void {
    const section = this.productsByRestaurant().find((item) => item.restaurantId === restaurantId);
    const group = section?.categories.find((item) => item.category === category);
    const draft: Record<string, number> = {};
    group?.products.forEach((product) => {
      draft[product.id] = 1;
    });

    this.restockDraftByProduct.set(draft);
    this.selectedCategoryRef.set({ restaurantId, category });
  }

  closeCategoryModal(): void {
    this.selectedCategoryRef.set(null);
    this.restockDraftByProduct.set({});
  }

  onRestaurantChange(restaurantId: RestaurantId): void {
    this.newProduct.restaurantId = restaurantId;
    const allowedAreas = this.areaOptionsForNewProduct().map((area) => area.value);
    if (!allowedAreas.includes(this.newProduct.area)) {
      this.newProduct.area = allowedAreas[0] ?? 'COCINA';
    }
  }

  onEditRestaurantChange(restaurantId: RestaurantId): void {
    this.editProduct.restaurantId = restaurantId;
    const allowedAreas = this.areaOptionsForEditProduct().map((area) => area.value);
    if (!allowedAreas.includes(this.editProduct.area)) {
      this.editProduct.area = allowedAreas[0] ?? 'COCINA';
    }
  }

  onArticleRestaurantChange(restaurantId: RestaurantId): void {
    this.articleDraft.restaurantId = restaurantId;
    this.articleLinks.update((links) =>
      links.filter((link) =>
        this.state.getVisibleProducts().some((product) => product.id === link.productId && product.restaurantId === restaurantId)
      )
    );
  }

  restockDraft(productId: string): number {
    return this.restockDraftByProduct()[productId] ?? 1;
  }

  updateRestockDraft(productId: string, value: string | number): void {
    const numeric = Number(value);
    const amount = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
    this.restockDraftByProduct.update((draft) => ({
      ...draft,
      [productId]: amount
    }));
  }

  addStock(productId: string): void {
    const amount = this.restockDraft(productId);
    this.state.restockProduct(productId, amount);
    this.restockDraftByProduct.update((draft) => ({
      ...draft,
      [productId]: 1
    }));
  }

  toggleArticleSort(column: ArticleSortColumn): void {
    if (this.articleSortColumn() === column) {
      this.articleSortDirection.set(this.articleSortDirection() === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.articleSortColumn.set(column);
    this.articleSortDirection.set('asc');
  }

  canCreateProduct(): boolean {
    const hasPromotionCategories =
      !this.newProduct.category.endsWith('_PROMOCION') || this.newProduct.promotionCategories.length > 0;
    return this.newProduct.name.trim().length > 1 && this.newProduct.price > 0 && hasPromotionCategories;
  }

  canSaveEditedProduct(): boolean {
    const hasPromotionCategories =
      !this.editProduct.category.endsWith('_PROMOCION') || this.editProduct.promotionCategories.length > 0;
    return this.editProduct.id.length > 0 && this.editProduct.name.trim().length > 1 && this.editProduct.price >= 0 && hasPromotionCategories;
  }

  canSaveArticle(): boolean {
    return this.articleDraft.name.trim().length > 1 && this.articleDraft.quantity >= 0;
  }

  async createProduct(): Promise<void> {
    if (!this.canCreateProduct()) {
      return;
    }

    this.productImageError.set('');
    this.isUploadingProductImage.set(true);

    let imageUrl: string | undefined;
    const imageFile = this.newProductImageFile();
    if (imageFile) {
      try {
        imageUrl = await this.state.uploadProductImage(
          imageFile,
          this.newProduct.restaurantId,
          `${Date.now()}-${this.newProduct.name.trim().replace(/\s+/g, '-').toLowerCase()}`
        );
      } catch (error) {
        console.error('No fue posible subir la imagen del producto.', error);
        this.productImageError.set('No se pudo subir la imagen. Intenta nuevamente.');
        this.isUploadingProductImage.set(false);
        return;
      }
    }

    this.state.addProduct({
      name: this.newProduct.name,
      description: this.newProduct.description,
      restaurantId: this.newProduct.restaurantId,
      area: this.newProduct.area,
      category: this.newProduct.category,
      promotionCategories: this.newProduct.promotionCategories,
      imageUrl,
      price: this.newProduct.price,
      stock: this.newProduct.stock,
      subItems: this.newProduct.subItems.length > 0 ? this.newProduct.subItems : undefined
    });

    this.isUploadingProductImage.set(false);
    this.closeAddModal();
  }

  onProductImageSelected(event: Event): void {
    this.productImageError.set('');
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.clearProductImageSelection();
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.clearProductImageSelection();
      this.productImageError.set('Selecciona un archivo de imagen valido.');
      return;
    }

    this.newProductImageFile.set(file);
    this.revokePreviewUrl(this.newProductImagePreviewUrl());
    this.newProductImagePreviewUrl.set(URL.createObjectURL(file));
  }

  openEditModal(product: Product): void {
    this.editProduct.id = product.id;
    this.editProduct.name = product.name;
    this.editProduct.description = product.description ?? '';
    this.editProduct.restaurantId = product.restaurantId;
    this.editProduct.area = product.area;
    this.editProduct.category = product.category;
    this.editProduct.promotionCategories = [...(product.promotionCategories ?? [])];
    this.editProduct.imageUrl = product.imageUrl;
    this.editProduct.price = product.price;
    this.editProduct.stock = product.stock;
    this.editProduct.available = product.available;
    this.editProduct.subItems = product.subItems ? JSON.parse(JSON.stringify(product.subItems)) : [];
    this.editProductImageRemoved.set(false);
    this.editProductImageError.set('');
    this.isUploadingEditProductImage.set(false);
    this.clearEditProductImageSelection();
    this.editProductImagePreviewUrl.set(product.imageUrl ?? '');
    this.isEditModalOpen.set(true);
  }

  onEditProductImageSelected(event: Event): void {
    this.editProductImageError.set('');
    this.editProductImageRemoved.set(false);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.clearEditProductImageSelection();
      this.editProductImagePreviewUrl.set(this.editProduct.imageUrl ?? '');
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.clearEditProductImageSelection();
      this.editProductImageError.set('Selecciona un archivo de imagen valido.');
      this.editProductImagePreviewUrl.set(this.editProduct.imageUrl ?? '');
      return;
    }

    this.revokePreviewUrl(this.editProductImagePreviewUrl());
    this.editProductImageFile.set(file);
    this.editProductImagePreviewUrl.set(URL.createObjectURL(file));
  }

  removeEditProductImage(): void {
    this.editProductImageRemoved.set(true);
    this.clearEditProductImageSelection();
    this.editProductImagePreviewUrl.set('');
  }

  async saveProductEdits(): Promise<void> {
    if (!this.canSaveEditedProduct()) {
      return;
    }

    this.editProductImageError.set('');
    this.isUploadingEditProductImage.set(true);

    let imageUrl = this.editProductImageRemoved() ? undefined : this.editProduct.imageUrl;
    const imageFile = this.editProductImageFile();
    if (imageFile) {
      try {
        imageUrl = await this.state.uploadProductImage(
          imageFile,
          this.editProduct.restaurantId,
          `${this.editProduct.id}-${Date.now()}`
        );
      } catch (error) {
        console.error('No fue posible actualizar la imagen del producto.', error);
        this.editProductImageError.set('No se pudo subir la nueva imagen. Intenta nuevamente.');
        this.isUploadingEditProductImage.set(false);
        return;
      }
    }

    this.state.updateProduct({
      id: this.editProduct.id,
      name: this.editProduct.name,
      description: this.editProduct.description,
      restaurantId: this.editProduct.restaurantId,
      area: this.editProduct.area,
      category: this.editProduct.category,
      promotionCategories: this.editProduct.promotionCategories,
      imageUrl,
      price: this.editProduct.price,
      stock: this.editProduct.stock,
      available: this.editProduct.available,
      subItems: this.editProduct.subItems.length > 0 ? this.editProduct.subItems : null
    });

    this.isUploadingEditProductImage.set(false);
    this.closeEditModal();
  }

  async openArticleModal(article?: InventoryArticle): Promise<void> {
    const firstRestaurant = this.state.allowedRestaurantIds()[0] ?? 'LA_PALMERA';
    this.articleDraft.id = article?.id ?? '';
    this.articleDraft.name = article?.name ?? '';
    this.articleDraft.restaurantId = article?.restaurantId ?? firstRestaurant;
    this.articleDraft.unit = article?.unit ?? 'UND';
    this.articleDraft.quantity = article?.quantity ?? 0;
    this.articleLinks.set(article?.linkedProducts.map((link) => ({ ...link })) ?? []);
    this.linkSearchQuery.set('');
    this.linkQuantityDrafts.set({});
    
    this.restockAmount.set(null);
    this.articleMovements.set([]);
    
    if (this.articleDraft.id) {
      const movements = await this.state.getInventoryMovementsByArticle(this.articleDraft.id);
      this.articleMovements.set(movements.filter(m => m.type === 'IN_RESTOCK'));
    }

    this.isArticleModalOpen.set(true);
  }

  closeArticleModal(): void {
    this.isArticleModalOpen.set(false);
    this.articleDraft.id = '';
    this.articleDraft.name = '';
    this.articleDraft.restaurantId = this.state.allowedRestaurantIds()[0] ?? 'LA_PALMERA';
    this.articleDraft.unit = 'UND';
    this.articleDraft.quantity = 0;
    this.articleLinks.set([]);
    this.linkSearchQuery.set('');
    this.linkQuantityDrafts.set({});
    this.closeLinkModal();
  }

  saveArticle(): void {
    if (!this.canSaveArticle()) {
      return;
    }

    const payload = {
      name: this.articleDraft.name,
      restaurantId: this.articleDraft.restaurantId,
      unit: this.articleDraft.unit,
      quantity: this.articleDraft.quantity,
      linkedProducts: this.articleLinks()
    };

    if (this.articleDraft.id) {
      this.state.updateInventoryArticle({
        id: this.articleDraft.id,
        ...payload
      });
    } else {
      this.state.addInventoryArticle(payload);
    }

    this.closeArticleModal();
  }

  async onAddStock(): Promise<void> {
    const amount = this.restockAmount();
    if (!amount || amount <= 0 || !this.articleDraft.id) return;
    
    await this.state.addStockToArticle(this.articleDraft.id, amount);
    this.articleDraft.quantity += amount;
    this.restockAmount.set(null);
    
    const movements = await this.state.getInventoryMovementsByArticle(this.articleDraft.id);
    this.articleMovements.set(movements.filter(m => m.type === 'IN_RESTOCK'));
  }

  formatMovementDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  getCreatorName(userId?: string): string {
    if (!userId) return 'Desconocido';
    return this.state.users().find((u) => u.id === userId)?.displayName ?? userId;
  }

  openLinkModal(): void {
    this.isLinkModalOpen.set(true);
  }

  closeLinkModal(): void {
    this.isLinkModalOpen.set(false);
    this.linkSearchQuery.set('');
  }

  linkDraftQuantity(productId: string): number {
    const existing = this.articleLinks().find((link) => link.productId === productId)?.quantityPerSale;
    return this.linkQuantityDrafts()[productId] ?? existing ?? 1;
  }

  updateLinkDraftQuantity(productId: string, value: string | number): void {
    const numeric = Number(value);
    this.linkQuantityDrafts.update((draft) => ({
      ...draft,
      [productId]: Number.isFinite(numeric) && numeric > 0 ? numeric : 1
    }));
  }

  attachProductLink(product: Product): void {
    const quantityPerSale = this.linkDraftQuantity(product.id);
    this.articleLinks.update((links) => {
      const existing = links.find((link) => link.productId === product.id);
      if (existing) {
        return links.map((link) =>
          link.productId === product.id
            ? { ...link, quantityPerSale, productName: product.name }
            : link
        );
      }

      return [
        ...links,
        {
          productId: product.id,
          productName: product.name,
          quantityPerSale
        }
      ];
    });
  }

  updateArticleLinkQuantity(productId: string, value: string | number): void {
    const numeric = Number(value);
    const quantityPerSale = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    this.articleLinks.update((links) =>
      links.map((link) => (link.productId === productId ? { ...link, quantityPerSale } : link))
    );
  }

  removeArticleLink(productId: string): void {
    this.articleLinks.update((links) => links.filter((link) => link.productId !== productId));
  }

  isLinkedProduct(productId: string): boolean {
    return this.articleLinks().some((link) => link.productId === productId);
  }

  closeAddModal(): void {
    this.isAddModalOpen.set(false);
    const firstRestaurant = this.state.allowedRestaurantIds()[0] ?? this.state.restaurants()[0]?.id ?? 'LA_PALMERA';
    this.newProduct.name = '';
    this.newProduct.description = '';
    this.newProduct.restaurantId = firstRestaurant;
    this.newProduct.area = 'COCINA';
    this.newProduct.category = `${firstRestaurant}_COMIDA`;
    this.newProduct.promotionCategories = [];
    this.newProduct.price = 1;
    this.newProduct.stock = 0;
    this.newProduct.subItems = [];
    this.productImageError.set('');
    this.isUploadingProductImage.set(false);
    this.clearProductImageSelection();
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.editProduct.id = '';
    this.editProduct.name = '';
    this.editProduct.description = '';
    const firstRestaurant = this.state.allowedRestaurantIds()[0] ?? 'LA_PALMERA';
    this.editProduct.restaurantId = firstRestaurant;
    this.editProduct.area = 'COCINA';
    this.editProduct.category = `${firstRestaurant}_COMIDA`;
    this.editProduct.promotionCategories = [];
    this.editProduct.imageUrl = undefined;
    this.editProduct.price = 1;
    this.editProduct.stock = 0;
    this.editProduct.available = true;
    this.editProduct.subItems = [];
    this.editProductImageRemoved.set(false);
    this.editProductImageError.set('');
    this.isUploadingEditProductImage.set(false);
    this.clearEditProductImageSelection();
    this.editProductImagePreviewUrl.set('');
  }

  restaurantLabel(restaurantId: RestaurantId): string {
    return this.state.restaurants().find((restaurant) => restaurant.id === restaurantId)?.name ?? restaurantId;
  }

  areaLabel(area: AreaId): string {
    if (area === 'COCINA') {
      return 'Cocina';
    }

    if (area === 'GRILL') {
      return 'Grill';
    }

    if (area === 'BARRA') {
      return 'Barra';
    }

    if (area === 'PIZZERIA') {
      return 'Pizzeria';
    }

    return 'Caja';
  }

  areaOptionsForNewProduct(): Array<{ value: AreaId; label: string }> {
    return this.areaOptionsForRestaurant(this.newProduct.restaurantId);
  }

  areaOptionsForEditProduct(): Array<{ value: AreaId; label: string }> {
    return this.areaOptionsForRestaurant(this.editProduct.restaurantId);
  }

  private areaOptionsForRestaurant(restaurantId: RestaurantId): Array<{ value: AreaId; label: string }> {
    if (restaurantId === 'NEXT_RESTOBAR') {
      return this.allAreaOptions.filter((area) => area.value === 'COCINA' || area.value === 'BARRA');
    }

    const devices = this.state.restaurants().find((restaurant) => restaurant.id === restaurantId)?.devices ?? [];
    return this.allAreaOptions.filter((area) => devices.includes(area.value));
  }

  toggleNewPromotionCategory(category: ProductBaseCategory, checked: boolean): void {
    if (checked) {
      this.newProduct.promotionCategories = [...new Set([...this.newProduct.promotionCategories, category])];
      return;
    }

    this.newProduct.promotionCategories = this.newProduct.promotionCategories.filter((item) => item !== category);
  }

  toggleEditPromotionCategory(category: ProductBaseCategory, checked: boolean): void {
    if (checked) {
      this.editProduct.promotionCategories = [...new Set([...this.editProduct.promotionCategories, category])];
      return;
    }

    this.editProduct.promotionCategories = this.editProduct.promotionCategories.filter((item) => item !== category);
  }

  promotionCategorySummary(categories: ProductBaseCategory[]): string {
    if (!categories.length) {
      return 'Sin categorias';
    }

    return categories
      .map((category) => this.promotionBaseCategories.find((item) => item.value === category)?.label ?? category)
      .join(', ');
  }

  categoryLabel(category: Product['category']): string {
    const found = this.state.productCategories().find((c) => c.id === category);
    return found ? found.name : category;
  }

  removeNewProductImage(): void {
    this.clearProductImageSelection();
  }

  categoriesForRestaurant(restaurantId: RestaurantId) {
    return this.productCategories().filter((c) => c.restaurantId === restaurantId);
  }

  openCategoryManager(restaurantId: RestaurantId): void {
    this.activeCategoryManagerRestaurantId.set(restaurantId);
    this.isCategoryManagerOpen.set(true);
    this.newCategoryName = '';
    this.newCategoryAllowMultipleAreas = false;
    this.cancelCategoryEdit();
  }

  closeCategoryManager(): void {
    this.isCategoryManagerOpen.set(false);
    this.activeCategoryManagerRestaurantId.set(null);
    this.newCategoryName = '';
    this.newCategoryAllowMultipleAreas = false;
    this.cancelCategoryEdit();
  }

  addCategory(): void {
    const name = this.newCategoryName.trim();
    const restId = this.activeCategoryManagerRestaurantId();
    if (name.length < 2 || !restId) return;
    this.state.addProductCategory(name, restId, this.newCategoryAllowMultipleAreas);
    this.newCategoryName = '';
    this.newCategoryAllowMultipleAreas = false;
  }

  isCategoryInUse(categoryId: string): boolean {
    return this.state.products().some((p) => p.category === categoryId);
  }

  deleteCategory(categoryId: string): void {
    const pin = window.prompt('Ingrese la clave de autorización de Administrador para eliminar esta categoría:');
    if (pin === null) {
      return;
    }

    if (!this.state.validateAdminSecurityPin(pin)) {
      window.alert('Clave de autorización incorrecta. Operación cancelada.');
      return;
    }

    const inUse = this.isCategoryInUse(categoryId);
    let confirmMsg = '¿Estás seguro de que quieres eliminar esta categoría?';
    if (inUse) {
      confirmMsg = 'Esta categoría tiene productos asociados. Si la eliminas, también se eliminarán todos los productos asociados. ¿Estás seguro de que quieres continuar?';
    }

    if (confirm(confirmMsg)) {
      if (inUse) {
        const associatedProducts = this.state.products().filter((p) => p.category === categoryId);
        associatedProducts.forEach((p) => {
          this.state.deleteProduct(p.id);
        });
      }
      this.state.deleteProductCategory(categoryId);
    }
  }

  startCategoryEdit(cat: any): void {
    this.editingCategoryId.set(cat.id);
    this.editingCategoryName = cat.name;
    this.editingCategoryAllowMultipleAreas = !!cat.allowMultipleAreas;
  }

  cancelCategoryEdit(): void {
    this.editingCategoryId.set(null);
    this.editingCategoryName = '';
  }

  saveCategoryEdit(id: string): void {
    const name = this.editingCategoryName.trim();
    if (name.length < 2) return;

    const categoryObj = this.productCategories().find(c => c.id === id);
    if (!categoryObj) return;

    const oldName = categoryObj.name;
    const restId = categoryObj.restaurantId;

    const count = this.state.products().filter(p =>
      p.restaurantId === restId &&
      (p.category === id || p.category === oldName)
    ).length;

    this.categoryEditTargetId.set(id);
    this.categoryEditTargetNewName.set(name);
    this.categoryEditTargetOldName.set(oldName);
    this.categoryEditTargetAllowMultipleAreas.set(this.editingCategoryAllowMultipleAreas);
    this.categoryEditAffectedCount.set(count);
    this.isConfirmCategoryEditOpen.set(true);
  }

  confirmCategoryEdit(): void {
    const id = this.categoryEditTargetId();
    const name = this.categoryEditTargetNewName();
    const oldName = this.categoryEditTargetOldName();
    const allowMulti = this.categoryEditTargetAllowMultipleAreas();
    if (id && name) {
      this.state.updateProductCategory(id, name, oldName, allowMulti);
    }
    this.closeConfirmCategoryEdit();
    this.cancelCategoryEdit();
  }

  closeConfirmCategoryEdit(): void {
    this.isConfirmCategoryEditOpen.set(false);
    this.categoryEditTargetId.set(null);
    this.categoryEditTargetNewName.set('');
    this.categoryEditTargetOldName.set('');
    this.categoryEditAffectedCount.set(0);
  }

  private clearProductImageSelection(): void {
    this.newProductImageFile.set(null);
    this.revokePreviewUrl(this.newProductImagePreviewUrl());
    this.newProductImagePreviewUrl.set('');
  }

  private clearEditProductImageSelection(): void {
    this.editProductImageFile.set(null);
    this.revokePreviewUrl(this.editProductImagePreviewUrl());
  }

  private revokePreviewUrl(current: string): void {
    if (current.startsWith('blob:')) {
      URL.revokeObjectURL(current);
    }
  }
}
