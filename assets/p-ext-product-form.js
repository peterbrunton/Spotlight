import { Component } from '@theme/component';
import { fetchConfig, onAnimationEnd, preloadImage } from '@theme/utilities';
import { ThemeEvents, CartAddEvent, CartErrorEvent, VariantUpdateEvent } from '@theme/events';
import { cartPerformance } from '@theme/performance';
import { morph } from '@theme/morph';

export const ADD_TO_CART_TEXT_ANIMATION_DURATION = 2000;

/**
 * A custom element that manages an add to cart button.
 *
 * @typedef {object} AddToCartRefs
 * @property {HTMLButtonElement} addToCartButton - The add to cart button.
 * @extends Component<AddToCartRefs>
 */
export class AddToCartComponent extends Component {
  requiredRefs = ['addToCartButton'];

  /** @type {number | undefined} */
  #animationTimeout;

  /** @type {number | undefined} */
  #cleanupTimeout;

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('pointerenter', this.#preloadImage);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this.#animationTimeout) clearTimeout(this.#animationTimeout);
    if (this.#cleanupTimeout) clearTimeout(this.#cleanupTimeout);
    this.removeEventListener('pointerenter', this.#preloadImage);
  }

  /**
   * Disables the add to cart button.
   */
  disable() {
    this.refs.addToCartButton.disabled = true;
  }

  /**
   * Enables the add to cart button.
   */
  enable() {
    this.refs.addToCartButton.disabled = false;
  }

  /**
   * Handles the click event for the add to cart button.
   * @param {MouseEvent & {target: HTMLElement}} event - The click event.
   */
  handleClick(event) {
    if (!this.#checkFormValidity()) return;

    this.animateAddToCart();

    if (!event.target.closest('.quick-add-modal')) this.#animateFlyToCart();
  }

  #preloadImage = () => {
    const image = this.dataset.productVariantMedia;

    if (!image) return;

    preloadImage(image);
  };

  /**
   * Animates the fly to cart animation.
   */
  #animateFlyToCart() {
    const { addToCartButton } = this.refs;
    const cartIcon = document.querySelector('.header-actions__cart-icon');

    const image = this.dataset.productVariantMedia;

    if (!cartIcon || !addToCartButton || !image) return;

    const flyToCartElement = /** @type {FlyToCart} */ (document.createElement('fly-to-cart'));

    flyToCartElement.style.setProperty('background-image', `url(${image})`);
    flyToCartElement.source = addToCartButton;
    flyToCartElement.destination = cartIcon;

    document.body.appendChild(flyToCartElement);
  }

  /**
   * Animates the add to cart button.
   */
  animateAddToCart() {
    const { addToCartButton } = this.refs;

    if (this.#animationTimeout) clearTimeout(this.#animationTimeout);
    if (this.#cleanupTimeout) clearTimeout(this.#cleanupTimeout);

    if (!addToCartButton.classList.contains('atc-added')) {
      addToCartButton.classList.add('atc-added');
    }

    this.#animationTimeout = setTimeout(() => {
      this.#cleanupTimeout = setTimeout(() => {
        this.refs.addToCartButton.classList.remove('atc-added');
      }, 10);
    }, ADD_TO_CART_TEXT_ANIMATION_DURATION);
  }

  /**
   * Checks if the form is valid when the user adds an item to cart.
   * Currently only checks the gift card recipient form.
   * @returns {boolean} - True if the form is valid, false otherwise.
   */
  #checkFormValidity() {
    const form = this.closest('form');
    if (!form) return true;

    const allInputs = Array.from(form.querySelectorAll('input, select, textarea')).filter((input) =>
      input.id.includes('Recipient')
    );
    let allInputsValid = true;
    for (const input of allInputs) {
      if (
        !(
          input instanceof HTMLInputElement ||
          input instanceof HTMLSelectElement ||
          input instanceof HTMLTextAreaElement
        )
      ) {
        continue;
      }

      // Skip disabled inputs
      if (input.disabled) continue;

      // Check validity on all input elements
      if (!input.checkValidity()) {
        allInputsValid = false;
        break;
      }
    }
    return allInputsValid;
  }
}

if (!customElements.get('add-to-cart-component')) {
  customElements.define('add-to-cart-component', AddToCartComponent);
}

/**
 * A custom element that manages a product form.
 *
 * @typedef {object} ProductFormRefs
 * @property {HTMLInputElement} variantId - The form input for submitting the variant ID.
 * @property {AddToCartComponent | undefined} addToCartButtonContainer - The add to cart button container element.
 * @property {HTMLElement | undefined} addToCartTextError - The add to cart text error.
 * @property {HTMLElement | undefined} acceleratedCheckoutButtonContainer - The accelerated checkout button container element.
 * @property {HTMLElement} liveRegion - The live region.
 *
 * @extends Component<ProductFormRefs>
 */
class ProductFormComponent extends Component {
  requiredRefs = ['variantId', 'liveRegion'];
  #abortController = new AbortController();

  /** @type {number | undefined} */
  #timeout;

  /**
   * Collects upsell items from checkbox upsell blocks.
   * @param {HTMLFormElement} form
   * @param {string | null} mainVariantId
   * @returns {{items: {id: string, quantity: number}[], mainExtra: number}}
   */
  #collectUpsellItems(form, mainVariantId) {
    /** @type {{id: string, quantity: number}[]} */
    const items = [];
    let mainExtra = 0;
    const formId = form.getAttribute('id');
    const checkboxes = new Set([
      ...form.querySelectorAll('[data-upsell-checkbox]'),
      ...(formId ? document.querySelectorAll(`[data-upsell-checkbox][form="${formId}"]`) : []),
    ]);

    checkboxes.forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      if (!checkbox.checked) return;

      const variantId = checkbox.dataset.upsellVariantId || checkbox.value;
      if (!variantId) return;

      const quantitySelectors = new Set([
        ...form.querySelectorAll(`[data-upsell-quantity][data-upsell-id="${variantId}"]`),
        ...(formId
          ? document.querySelectorAll(
              `[data-upsell-quantity][data-upsell-id="${variantId}"][form="${formId}"]`
            )
          : []),
      ]);
      const quantityInput = [...quantitySelectors][0];

      let quantity = 1;
      if (quantityInput instanceof HTMLInputElement) {
        const parsed = Number(quantityInput.value);
        if (!Number.isNaN(parsed) && parsed > 0) quantity = parsed;
      }

      if (mainVariantId && variantId === mainVariantId) {
        mainExtra += quantity;
        return;
      }

      items.push({ id: variantId, quantity });
    });

    return { items, mainExtra };
  }

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#abortController;
    const target = this.closest('.shopify-section, dialog, product-card');
    target?.addEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate, { signal });
    target?.addEventListener(ThemeEvents.variantSelected, this.#onVariantSelected, { signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
  }

  /**
   * Handles the submit event for the product form.
   *
   * @param {Event} event - The submit event.
   */
  handleSubmit(event) {
    console.log('🚀 Add to cart started');
    const { addToCartTextError } = this.refs;
    // Stop default behaviour from the browser
    event.preventDefault();

    if (this.#timeout) clearTimeout(this.#timeout);

    // Check if the add to cart button is disabled and do an early return if it is
    if (this.refs.addToCartButtonContainer?.refs.addToCartButton?.getAttribute('disabled') === 'true') return;

    // Send the add to cart information to the cart
    const form = this.querySelector('form');

    if (!form) throw new Error('Product form element missing');

    const formData = new FormData(form);
    const mainVariantId = formData.get('id');
    const baseQuantity = Number(formData.get('quantity')) || Number(this.dataset.quantityDefault);
    const { items: upsellItems, mainExtra } = this.#collectUpsellItems(
      form,
      typeof mainVariantId === 'string' ? mainVariantId : null
    );
    const mainQuantity = baseQuantity + mainExtra;
    if (mainExtra > 0) {
      formData.set('quantity', String(mainQuantity));
    }

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    let cartItemComponentsSectionIds = [];
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        cartItemComponentsSectionIds.push(item.dataset.sectionId);
      }
      formData.append('sections', cartItemComponentsSectionIds.join(','));
    });

    let requestBody = formData;

    if (upsellItems.length > 0) {
      const multiFormData = new FormData();
      const mainItemIndex = 0;

      if (mainVariantId) {
        multiFormData.append(`items[${mainItemIndex}][id]`, String(mainVariantId));
        multiFormData.append(`items[${mainItemIndex}][quantity]`, String(mainQuantity));
      }

      const sellingPlan = formData.get('selling_plan');
      if (sellingPlan) {
        multiFormData.append(`items[${mainItemIndex}][selling_plan]`, String(sellingPlan));
      }

      for (const [key, value] of formData.entries()) {
        if (!key.startsWith('properties[')) continue;
        multiFormData.append(`items[${mainItemIndex}][${key}]`, String(value));
      }

      upsellItems.forEach((item, index) => {
        const itemIndex = index + 1;
        multiFormData.append(`items[${itemIndex}][id]`, String(item.id));
        multiFormData.append(`items[${itemIndex}][quantity]`, String(item.quantity));
      });

      const sectionsValue = cartItemComponentsSectionIds.join(',');
      if (sectionsValue) multiFormData.append('sections', sectionsValue);
      multiFormData.append('sections_url', window.location.pathname);

      requestBody = multiFormData;
    }

    const fetchCfg = fetchConfig('javascript', { body: requestBody });

    fetch(Theme.routes.cart_add_url, {
      ...fetchCfg,
      headers: {
        ...fetchCfg.headers,
        Accept: 'text/html',
      },
    })
      .then((response) => response.json())
      .then((response) => {
        if (response.status) {
          this.dispatchEvent(
            new CartErrorEvent(form.getAttribute('id') || '', response.message, response.description, response.errors)
          );

          if (!addToCartTextError) return;
          addToCartTextError.classList.remove('hidden');

          // Reuse the text node if the user is spam-clicking
          const textNode = addToCartTextError.childNodes[2];
          if (textNode) {
            textNode.textContent = response.message;
          } else {
            const newTextNode = document.createTextNode(response.message);
            addToCartTextError.appendChild(newTextNode);
          }

          // Create or get existing error live region for screen readers
          this.#setLiveRegionText(response.message);

          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');

            // Clear the announcement
            this.#clearLiveRegionText();
          }, 10000);

          // When we add more than the maximum amount of items to the cart, we need to dispatch a cart update event
          // because our back-end still adds the max allowed amount to the cart.
          this.dispatchEvent(
            new CartAddEvent({}, this.id, {
              didError: true,
              source: 'product-form-component',
              itemCount: Number(formData.get('quantity')) || Number(this.dataset.quantityDefault),
              productId: this.dataset.productId,
            })
          );

          return;
        } else {
          console.log('🎯 Add to cart success block reached'); 
          const id = mainVariantId ?? formData.get('id');
          const quantity = mainQuantity;
          const upsellCount = upsellItems.reduce((sum, item) => sum + item.quantity, 0);
          const totalAdded = mainQuantity + upsellCount;
          const productId = this.dataset.productId;

          if (addToCartTextError) {
            addToCartTextError.classList.add('hidden');
            addToCartTextError.removeAttribute('aria-live');
          }

          if (!id) throw new Error('Form ID is required');

          // Get tracking data from add-to-cart component's data attribute
          const addToCartComponent = this.refs.addToCartButtonContainer;
          let trackingData = null;

          if (addToCartComponent?.dataset.productTracking) {
            try {
              trackingData = JSON.parse(addToCartComponent.dataset.productTracking);
              console.log('✅ Found tracking data:', trackingData);
            } catch (e) {
              console.warn('Failed to parse tracking data:', e);
            }
          } else {
            console.warn('No tracking data found on add-to-cart component');
          }

          // Use tracking data for analytics
          const currency = window.Shopify?.currency?.active || 'EUR';
          const price = trackingData ? (trackingData.price / 100) : 0;
          const comparePrice = trackingData && trackingData.compare_at_price ? (trackingData.compare_at_price / 100) : price;
          const discount = comparePrice > price ? comparePrice - price : 0;

          // GA4 Tracking
          try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
              event: 'add_to_cart',
              ecommerce: {
                currency: currency,
                value: price,
                items: [{
                  item_id: id,
                  item_name: trackingData?.name || 'Unknown Product',
                  discount: discount,
                  item_brand: trackingData?.brand || '',
                  item_category: trackingData?.category || '',
                  item_variant: trackingData?.variant_title || '',
                  price: price,
                  quantity: quantity
                }]
              }
            });
            console.log('✅ GA4 tracking sent');
          } catch (error) {
            console.warn('❌ GA4 tracking failed:', error);
          }

          console.log('Klaviyo script loaded:', typeof window.klaviyo !== 'undefined');
          console.log('_learnq exists:', Array.isArray(window._learnq));
          console.log('Pandectes blocking Klaviyo:', window.PandectesRulesSettings?.blocker?.klaviyoIsActive === false);

          // Klaviyo Tracking
          const klaviyoData = {
            $value: price * quantity,
            id: trackingData?.id || productId,
            name: trackingData?.name || 'Unknown Product',
            currency: currency,
            price: price,
            brand: trackingData?.brand || '',
            category: trackingData?.category || '',
            variant: trackingData?.variant_title || '',
            'compare-at-price': comparePrice,
            image: trackingData?.image || '',
            quantity: quantity 
          };

          const trackKlaviyo = (retryCount = 0) => {
            // Check if Klaviyo is fully loaded
            if (window._learnq && typeof window._learnq.track === 'function') {
              try {
                // Use the direct track method instead of push
                window._learnq.track('Added to Cart', klaviyoData);
                console.log('✅ Klaviyo tracking sent via API', klaviyoData);
                return true;
              } catch (error) {
                console.warn('❌ Klaviyo API tracking failed:', error);
                return false;
              }
            } else if (window._learnq && Array.isArray(window._learnq)) {
              try {
                // Use push method if still in queue mode
                window._learnq.push(['track', 'Added to Cart', klaviyoData]);
                console.log('✅ Klaviyo tracking sent via push', klaviyoData);
                return true;
              } catch (error) {
                console.warn('❌ Klaviyo push tracking failed:', error);
                return false;
              }
            } else {
              console.warn(`⚠️ Klaviyo not ready (attempt ${retryCount + 1})`);
              if (retryCount < 2) {
                setTimeout(() => trackKlaviyo(retryCount + 1), retryCount === 0 ? 500 : 1500);
              }
              return false;
            }
          };

          trackKlaviyo();

          // Add aria-live region to inform screen readers that the item was added
          if (this.refs.addToCartButtonContainer?.refs.addToCartButton) {
            const addToCartButton = this.refs.addToCartButtonContainer.refs.addToCartButton;
            const addedTextElement = addToCartButton.querySelector('.add-to-cart-text--added');
            const addedText = addedTextElement?.textContent?.trim() || Theme.translations.added;

            this.#setLiveRegionText(addedText);

            setTimeout(() => {
              this.#clearLiveRegionText();
            }, 5000);
          }

          this.dispatchEvent(
            new CartAddEvent({}, id.toString(), {
              source: 'product-form-component',
              itemCount: totalAdded,
              productId: this.dataset.productId,
              sections: response.sections,
            })
          );
        }
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        // add more thing to do in here if needed.
        cartPerformance.measureFromEvent('add:user-action', event);
      });
  }

  /**
   * @param {*} text
   */
  #setLiveRegionText(text) {
    const liveRegion = this.refs.liveRegion;
    liveRegion.textContent = text;
  }

  #clearLiveRegionText() {
    const liveRegion = this.refs.liveRegion;
    liveRegion.textContent = '';
  }

  /**
   * @param {VariantUpdateEvent} event
   */
  #onVariantUpdate = (event) => {
    if (event.detail.data.newProduct) {
      this.dataset.productId = event.detail.data.newProduct.id;
    } else if (event.detail.data.productId !== this.dataset.productId) {
      return;
    }

    const { variantId, addToCartButtonContainer } = this.refs;

    const currentAddToCartButton = addToCartButtonContainer?.refs.addToCartButton;
    const newAddToCartButton = event.detail.data.html.querySelector('[ref="addToCartButton"]');

    if (!currentAddToCartButton) return;

    // Update the button state
    if (event.detail.resource == null || event.detail.resource.available == false) {
      addToCartButtonContainer.disable();
      this.refs.acceleratedCheckoutButtonContainer?.setAttribute('hidden', 'true');
    } else {
      addToCartButtonContainer.enable();
      this.refs.acceleratedCheckoutButtonContainer?.removeAttribute('hidden');
    }

    // Update the add to cart button text and icon
    if (newAddToCartButton) {
      morph(currentAddToCartButton, newAddToCartButton);
    }

    // Update the variant ID
    variantId.value = event.detail.resource.id ?? '';

    // Set the data attribute for the add to cart button to the product variant media if it exists
    if (event.detail.resource) {
      const productVariantMedia = event.detail.resource.featured_media?.preview_image?.src;
      productVariantMedia &&
        addToCartButtonContainer?.setAttribute('data-product-variant-media', productVariantMedia + '&width=100');
    }
  };

  /**
   * Disable the add to cart button while the UI is updating before #onVariantUpdate is called.
   * Accelerated checkout button is also disabled via its own event listener not exposed to the theme.
   */
  #onVariantSelected = () => {
    this.refs.addToCartButtonContainer?.disable();
  };
}

if (!customElements.get('product-form-component')) {
  customElements.define('product-form-component', ProductFormComponent);
}

class FlyToCart extends HTMLElement {
  /** @type {Element} */
  source;

  /** @type {Element} */
  destination;

  connectedCallback() {
    this.#animate();
  }

  #animate() {
    const rect = this.getBoundingClientRect();
    const sourceRect = this.source.getBoundingClientRect();
    const destinationRect = this.destination.getBoundingClientRect();

    //Define bezier curve points
    // Maybe add half of the size of the flying thingy to the x and y to make it center properly
    const offset = {
      x: rect.width / 2,
      y: rect.height / 2,
    };
    const startPoint = {
      x: sourceRect.left + sourceRect.width / 2 - offset.x,
      y: sourceRect.top + sourceRect.height / 2 - offset.y,
    };

    const endPoint = {
      x: destinationRect.left + destinationRect.width / 2 - offset.x,
      y: destinationRect.top + destinationRect.height / 2 - offset.y,
    };

    //Calculate the control points
    const controlPoint1 = { x: startPoint.x, y: startPoint.y - 200 }; // Go up 200px
    const controlPoint2 = { x: endPoint.x - 300, y: endPoint.y - 100 }; // Go left 300px and up 100px

    //Animation variables
    /** @type {number | null} */
    let startTime = null;
    const duration = 600; // 600ms

    this.style.opacity = '1';

    /**
     * Animates the flying thingy along the bezier curve.
     * @param {number} currentTime - The current time.
     */
    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Calculate current position along the bezier curve
      const position = bezierPoint(progress, startPoint, controlPoint1, controlPoint2, endPoint);

      //Update the position of the flying thingy
      this.style.setProperty('--x', `${position.x}px`);
      this.style.setProperty('--y', `${position.y}px`);

      // Scale down as it approaches the cart
      const scale = 1 - progress * 0.5;
      this.style.setProperty('--scale', `${scale}`);

      //Continue the animation if not finished
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        //Fade out the flying thingy
        this.style.opacity = '0';
        onAnimationEnd(this, () => this.remove());
      }
    };

    // Position the flying thingy back to the start point
    this.style.setProperty('--x', `${startPoint.x}px`);
    this.style.setProperty('--y', `${startPoint.y}px`);

    //Start the animation
    requestAnimationFrame(animate);
  }
}

/**
 * Calculates a point on a cubic Bézier curve.
 * @param {number} t - The parameter value (0 <= t <= 1).
 * @param {{x: number, y: number}} p0 - The starting point (x, y).
 * @param {{x: number, y: number}} p1 - The first control point (x, y).
 * @param {{x: number, y: number}} p2 - The second control point (x, y).
 * @param {{x: number, y: number}} p3 - The ending point (x, y).
 * @returns {{x: number, y: number}} The point on the curve.
 */
function bezierPoint(t, p0, p1, p2, p3) {
  const cX = 3 * (p1.x - p0.x);
  const bX = 3 * (p2.x - p1.x) - cX;
  const aX = p3.x - p0.x - cX - bX;

  const cY = 3 * (p1.y - p0.y);
  const bY = 3 * (p2.y - p1.y) - cY;
  const aY = p3.y - p0.y - cY - bY;

  const x = aX * Math.pow(t, 3) + bX * Math.pow(t, 2) + cX * t + p0.x;
  const y = aY * Math.pow(t, 3) + bY * Math.pow(t, 2) + cY * t + p0.y;

  return { x, y };
}

if (!customElements.get('fly-to-cart')) {
  customElements.define('fly-to-cart', FlyToCart);
}
