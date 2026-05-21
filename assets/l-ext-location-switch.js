import { DialogComponent } from '@theme/dialog';
import { requestIdleCallback } from '@theme/utilities';

class LocationSwitcher extends DialogComponent {
  static euCountries = [
    "IE", "BE", "EL", "LT", "PT", "BG", "ES", "LU", "RO", "CZ",
    "FR", "HU", "MT", "SK", "DK", "DE", "IT", "NL",
    "FI", "EE", "CY", "AT", "SE", "LV", "PL"
  ];

  static SESSION_KEY = 'location_checked';
  static CACHE_KEY = 'user_location_cache';
  static CACHE_DURATION = 24 * 60 * 60 * 1000;

  connectedCallback() {
    super.connectedCallback();
    this.setupEventListeners();
    this.whenReady(() => {
      this.scheduleLocationCheck();
    });
  }

  setupEventListeners() {
    const closeButton = this.querySelector('.location-switcher__close');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.closeDialog());
    }

    const stayButtons = this.querySelectorAll('.location-switcher__button--stay');
    stayButtons.forEach(btn => {
      btn.addEventListener('click', () => this.closeDialog());
    });
  }

  whenReady(callback) {
    if (this.refs.dialog) {
      callback();
    } else {
      requestAnimationFrame(() => {
        if (this.refs.dialog) {
          callback();
        } else {
          setTimeout(() => callback(), 10);
        }
      });
    }
  }

  scheduleLocationCheck() {
    if (sessionStorage.getItem(LocationSwitcher.SESSION_KEY)) return;

    const startLocationCheck = () => {
      requestIdleCallback(() => {
        this.checkUserLocation();
      }, { timeout: 3000 });
    };

    if (document.readyState === 'complete') {
      startLocationCheck();
    } else {
      window.addEventListener('load', startLocationCheck, { once: true });
    }
  }

  async checkUserLocation() {
    try {
      const locationData = await this.getLocationData();
      if (locationData) {
        this.processLocation(locationData);
      } else {
        this.processLocation({ country_code: 'GB', region: 'England', service: 'fallback' });
      }
    } catch (error) {
      this.processLocation({ country_code: 'GB', region: 'England', service: 'fallback' });
    }
  }

  async getLocationData() {
    const cached = this.getCachedLocation();
    if (cached) return cached;

    const services = [
      {
        name: 'ipinfo',
        url: 'https://ipinfo.io/json',
        timeout: 2500,
        parse: (data) => ({ country_code: data.country, region: data.region || '', service: 'ipinfo' })
      },
      {
        name: 'ipapi',
        url: 'https://ipapi.co/json/',
        timeout: 3000,
        parse: (data) => ({ country_code: data.country_code, region: data.region || '', service: 'ipapi' })
      },
      {
        name: 'cloudflare',
        url: 'https://cf-ns.com/cdn-cgi/trace',
        timeout: 1500,
        parse: (text) => {
          const country = text.match(/loc=([A-Z]{2})/)?.[1];
          return country ? { country_code: country, region: '', service: 'cloudflare' } : null;
        }
      }
    ];

    for (const service of services) {
      try {
        const response = await fetch(service.url, { signal: AbortSignal.timeout(service.timeout) });
        const data = service.name === 'cloudflare'
          ? service.parse(await response.text())
          : service.parse(await response.json());

        if (data?.country_code) {
          this.cacheLocation(data);
          return data;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  getCachedLocation() {
    try {
      const cached = localStorage.getItem(LocationSwitcher.CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < LocationSwitcher.CACHE_DURATION) {
          return { country_code: data.country_code, region: data.region };
        }
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  cacheLocation(data) {
    try {
      localStorage.setItem(LocationSwitcher.CACHE_KEY, JSON.stringify({
        country_code: data.country_code,
        region: data.region,
        timestamp: Date.now()
      }));
    } catch (error) {}
  }

  processLocation({ country_code, region }) {
    sessionStorage.setItem(LocationSwitcher.SESSION_KEY, '1');

    if (LocationSwitcher.euCountries.includes(country_code)) return;

    let modalRegion = 'row';
    if (country_code === 'GB' || ['IM', 'JE', 'GG'].includes(country_code)) {
      modalRegion = region === 'Northern Ireland' ? 'ni' : 'gb';
    }

    requestAnimationFrame(() => {
      this.showLocationModal(modalRegion);
    });
  }

  showLocationModal(region) {
    if (!this.refs.dialog) {
      setTimeout(() => this.showLocationModal(region), 50);
      return;
    }

    ['gbContent', 'niContent', 'rowContent'].forEach(refName => {
      if (this.refs[refName]) this.refs[refName].hidden = true;
    });

    const contentRef = `${region}Content`;
    if (this.refs[contentRef]) this.refs[contentRef].hidden = false;

    if (this.showDialog && typeof this.showDialog === 'function') {
      this.showDialog();
    }
  }
}

if (!customElements.get('location-switcher')) {
  customElements.define('location-switcher', LocationSwitcher);
}
