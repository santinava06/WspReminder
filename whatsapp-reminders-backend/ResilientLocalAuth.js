const { LocalAuth } = require('whatsapp-web.js');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isBusyError = (error) => {
  const message = error?.message || String(error);
  return message.includes('EBUSY') || message.includes('ENOTEMPTY') || message.includes('EPERM');
};

class ResilientLocalAuth extends LocalAuth {
  constructor(options = {}) {
    super({
      rmMaxRetries: 30,
      ...options,
    });
  }

  async closeBrowserIfNeeded() {
    const browser = this.client?.pupBrowser;

    if (!browser?.isConnected?.()) return;

    try {
      await browser.close();
    } catch (error) {
      if (!isBusyError(error)) {
        console.warn('No se pudo cerrar Chromium antes de limpiar la sesion:', error?.message || error);
      }
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!browser.isConnected?.()) return;
      await delay(100);
    }
  }

  async logout() {
    await this.closeBrowserIfNeeded();

    let lastError;

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      try {
        await super.logout();
        return;
      } catch (error) {
        lastError = error;
        if (!isBusyError(error) || attempt === 8) break;
        await delay(250 * attempt);
      }
    }

    throw lastError;
  }
}

module.exports = ResilientLocalAuth;
