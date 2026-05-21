import { Component } from '@theme/component';
import { debounce } from '@theme/utilities';

/**
 * Klaviyo email signup web component
 * 
 * @attr {string} list-id - Klaviyo list ID
 * @attr {string} account-id - Klaviyo account ID  
 */
class KlaviyoSignup extends Component {
  /** @type {string[]} */
  requiredRefs = ['form', 'email', 'submit', 'messages', 'successMessage', 'errorMessage', 'errorText'];

  // Configuration constants
  static DEBOUNCE_DELAY = 300;
  static TIMEOUT = 6000;

  // Private fields
  #isSubmitting = false;
  #initialized = false;
  #debouncedSubmit;

  connectedCallback() {
    super.connectedCallback();
    this.#scheduleInitialization();
  }

  /**
   * Schedule lazy initialization when component becomes visible
   */
  #scheduleInitialization() {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          this.#initialize();
          observer.disconnect();
        }
      }, { 
        rootMargin: '100px',
        threshold: 0 
      });
      
      observer.observe(this);
    } else {
      setTimeout(() => this.#initialize(), 0);
    }
  }

  /**
   * Initialize the component
   */
  #initialize() {
    if (this.#initialized) {
      return;
    }
    
    this.#initialized = true;

    // Validate configuration
    if (!this.listId || !this.accountId) {
      console.error('❌ Klaviyo configuration missing:', { 
        listId: this.listId, 
        accountId: this.accountId 
      });
      return;
    }

    // Validate refs
    const missingRefs = this.requiredRefs.filter(ref => !this.refs[ref]);
    if (missingRefs.length > 0) {
      console.error('❌ Klaviyo missing required refs:', missingRefs);
      return;
    }

    if (this.refs.form) {
      this.refs.form.addEventListener('submit', this.handleSubmit);
    } else {
      console.error('💥 Form element not found — check ref="form" in markup');
    }

    // Setup debounced submit handler
    this.#debouncedSubmit = debounce(this.#processSubmission.bind(this), KlaviyoSignup.DEBOUNCE_DELAY);
  }


  /**
   * Handle form submission
   * @param {Event} event 
   */
  handleSubmit = (event) => {
    event.preventDefault();
    
    if (!this.#initialized) {
      this.#initialize();
    }
    
    if (!this.#debouncedSubmit) {
      return;
    }
    this.#debouncedSubmit();
  }

  /**
   * Process the email submission
   */
  async #processSubmission() {
    if (this.#isSubmitting) {
      return;
    }

    const email = this.refs.email?.value.trim();
    
    // Reset UI state
    this.#hideMessages();
    
    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.#showError('Please enter a valid email address');
      return;
    }

    this.#isSubmitting = true;
    this.#setLoadingState(true);

    try {
      const formData = new FormData();
      formData.append('g', this.listId);
      formData.append('email', email);
      formData.append('$source', 'shopify_web_component');
      formData.append('$consent', 'web');

      // ✅ FIXED: No spaces in URL
      const url = 'https://manage.kmail-lists.com/ajax/subscriptions/subscribe';

      // Use AbortController for real timeout control
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), KlaviyoSignup.TIMEOUT);

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      // Try to parse as JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        // Not JSON — fall back to text search
        if (responseText.includes('success') || responseText.includes('thank')) {
          responseData = { success: true };
        } else {
          responseData = { success: false };
        }
      }

      // Check for success in response data
      if (response.ok && (responseData.success === true || responseData.data?.is_subscribed === true)) {
        this.#showSuccess();
        this.refs.email.value = '';
        
        // Track analytics (non-blocking)
        setTimeout(() => this.#trackSubscription(email), 0);
      } else {
        console.warn('⚠️ [KLAVIYO] Submission rejected:', responseText);
        this.#showError('Something went wrong. Please try again.');
      }
    } catch (error) {
      console.error('💥 [ERROR] Submission failed:', error.message);
      if (error.name === 'AbortError') {
        console.error('⏰ Request timed out after', KlaviyoSignup.TIMEOUT, 'ms');
      }
      this.#showError('Something went wrong. Please try again.');
    } finally {
      this.#isSubmitting = false;
      this.#setLoadingState(false);
    }
  }

  /**
   * Track subscription in analytics
   * @param {string} email 
   */
  #trackSubscription(email) {
    // Klaviyo tracking
    if (window._learnq) {
      window._learnq.push(['track', 'Subscribed to Newsletter', { email }]);
    }
    
    // Google Analytics
    if (window.dataLayer) {
      window.dataLayer.push({
        event: 'newsletter_signup',
        email
      });
    }
  }

  /**
   * Set loading state
   * @param {boolean} loading 
   */
  #setLoadingState(loading) {
    if (!this.refs.submit) return;
    this.refs.submit.disabled = loading;
    
    const spinner = this.refs.submit.querySelector('.loading-spinner');
    const text = this.refs.submit.querySelector('.button-text');
    
    if (spinner && text) {
      spinner.style.display = loading ? '' : 'none';
      text.style.display = loading ? 'none' : '';
    }
  }

  /**
   * Hide all messages
   */
  #hideMessages() {
    if (this.refs.successMessage) this.refs.successMessage.hidden = true;
    if (this.refs.errorMessage) this.refs.errorMessage.hidden = true;
  }

  /**
   * Show success message
   */
  #showSuccess() {
    this.#hideMessages();
    if (this.refs.successMessage) {
      this.refs.successMessage.hidden = false;
    }
  }

  /**
   * Show error message
   * @param {string} message 
   */
  #showError(message) {
    this.#hideMessages();
    
    if (this.refs.errorText) {
      this.refs.errorText.textContent = message;
    }
    
    if (this.refs.errorMessage) {
      this.refs.errorMessage.hidden = false;
    }
  }

  // Simple getters for required attributes
  get listId() {
    return this.getAttribute('list-id');
  }

  get accountId() {
    return this.getAttribute('account-id');
  }
}

if (!customElements.get('klaviyo-signup')) {
  customElements.define('klaviyo-signup', KlaviyoSignup);
}