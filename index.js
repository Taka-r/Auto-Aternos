const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

async function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

class AternosClient {
    /**
     * Initialize the AternosClient
     * @param {Object} config - Configuration options
     * @param {string} config.username - Aternos username
     * @param {string} config.password - Aternos password
     * @param {boolean} [config.headless=true] - Run browser in headless mode
     * @param {string} [config.userDataDir] - Path to save browser session data
     */
    constructor({ username, password, headless = true, userDataDir }) {
        if (!username || !password) throw new Error("Aternos username and password are required.");
        
        this.username = username;
        this.password = password;
        this.headless = headless;
        this.userDataDir = userDataDir || path.join(__dirname, 'user_data');
        this.browser = null;
        this.page = null;
    }

    /**
     * Launch browser and authenticate
     */
    async init() {
        this.browser = await puppeteer.launch({
            headless: this.headless,
            userDataDir: this.userDataDir,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 800 });
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        await this._login();
    }

    async _login() {
        await this.page.goto('https://aternos.org/go/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        try {
            const [cookieBtn] = await this.page.$x("//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'agree') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'accept')]");
            if (cookieBtn) {
                await cookieBtn.click();
                await delay(1000);
            }
        } catch(e) {}

        if (this.page.url().includes('/server')) return true; // Already logged in

        try {
            await this.page.waitForSelector('input[type="text"]', { timeout: 15000 });
            await delay(1000); 
            
            const userInput = await this.page.$('input[type="text"]');
            if (userInput) {
                await userInput.click({ clickCount: 3 });
                await userInput.type(this.username, { delay: 100 });
            }

            const passInput = await this.page.$('input[type="password"]');
            if (passInput) {
                await passInput.click({ clickCount: 3 });
                await passInput.type(this.password, { delay: 100 });
                await passInput.press('Enter');
            }
            
            await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
            return true;
        } catch (err) {
            await this.page.screenshot({ path: 'debug_login.png' });
            throw new Error('Failed to log in automatically. Captcha might be present.');
        }
    }

    /**
     * Get list of servers
     */
    async fetchServers() {
        if (!this.page) await this.init();
        await this.page.goto('https://aternos.org/servers/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(2000);
        return await this.page.evaluate(() => {
            const bodies = document.querySelectorAll('.server-body');
            const result = [];
            bodies.forEach((body, idx) => {
                const nameEl = body.querySelector('.name');
                const nameText = nameEl ? nameEl.innerText.trim() : body.innerText.trim().split('\n')[0];
                if (nameText) result.push({ name: nameText, elementIndex: idx });
            });
            return result;
        });
    }

    async _handlePopups() {
        try {
            const closed = await this.page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, .btn'));
                const noBtn = btns.find(b => b.innerText && b.innerText.trim().toLowerCase() === 'no');
                if (noBtn && noBtn.style.display !== 'none' && noBtn.style.visibility !== 'hidden') {
                    noBtn.click();
                    return true;
                }
                return false;
            });
            if (closed) await delay(1000);
        } catch(e) {}
    }

    async _navigateToServer(targetServerName = null) {
        const servers = await this.fetchServers();
        if (servers.length === 0) throw new Error('No servers found on your account.');
        
        let selectedServer = servers[0];
        if (targetServerName) {
            const found = servers.find(s => s.name.toLowerCase() === targetServerName.toLowerCase());
            if (found) selectedServer = found;
            else throw new Error(`Target server "${targetServerName}" not found.`);
        }

        await this.page.evaluate((idx) => {
            const bodies = document.querySelectorAll('.server-body');
            if (bodies[idx]) bodies[idx].click();
        }, selectedServer.elementIndex);
        
        await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
        return selectedServer;
    }

    /**
     * Starts the specified server
     * @param {string} [targetServerName] - The name of the server to start. Leave blank to pick the first one.
     * @param {Function} [progressCallback] - Callback function to receive status updates like "starting", "loading"
     */
    async startServer(targetServerName = null, progressCallback = null) {
        if (!this.page) await this.init();
        await this._navigateToServer(targetServerName);
        await this._handlePopups();

        try {
            await this.page.waitForFunction(() => {
                const btn = document.querySelector('#start');
                if (btn) return true;
                const allBtns = Array.from(document.querySelectorAll('button, .btn, .button'));
                return allBtns.some(b => b.innerText && b.innerText.toLowerCase().includes('start'));
            }, { timeout: 15000 });
            
            await this.page.evaluate(() => {
                const btn = document.querySelector('#start');
                if (btn) { btn.click(); return; }
                const allBtns = Array.from(document.querySelectorAll('button, .btn, .button'));
                const startBtn = allBtns.find(b => b.innerText && b.innerText.toLowerCase().includes('start'));
                if (startBtn) startBtn.click();
            });

            let checkCount = 0;
            while (checkCount < 120) {
                try {
                    await this.page.evaluate(() => {
                        const confirmBtn = document.querySelector('#confirm');
                        if (confirmBtn && confirmBtn.style.display !== 'none' && confirmBtn.style.visibility !== 'hidden') {
                            confirmBtn.click();
                            return true;
                        }
                        const btns = Array.from(document.querySelectorAll('button, .btn'));
                        const conf = btns.find(b => b.innerText && b.innerText.toLowerCase().includes('confirm'));
                        if (conf && conf.style.display !== 'none') {
                            conf.click();
                            return true;
                        }
                        return false;
                    });
                } catch(e) {}

                const statusText = await this.page.evaluate(() => {
                    const statusEl = document.querySelector('.statuslabel-label');
                    return statusEl ? statusEl.innerText.trim().toLowerCase() : '';
                });
                
                if (progressCallback && statusText) progressCallback(statusText);

                if (statusText === 'online') return { success: true, status: 'online' };
                
                await delay(5000); 
                checkCount++;
            }
            throw new Error('Server start timed out.');
        } catch (err) {
            await this.page.screenshot({ path: 'debug_start.png' });
            throw new Error('Error finding or clicking the Start button. Server might already be running.');
        }
    }

    /**
     * Stops the specified server
     * @param {string} [targetServerName] - The name of the server to stop. Leave blank to pick the first one.
     * @param {Function} [progressCallback] - Callback function to receive status updates like "saving", "stopping"
     */
    async stopServer(targetServerName = null, progressCallback = null) {
        if (!this.page) await this.init();
        await this._navigateToServer(targetServerName);
        await this._handlePopups();

        try {
            await this.page.waitForFunction(() => {
                const btn = document.querySelector('#stop');
                if (btn && btn.style.display !== 'none') return true;
                const allBtns = Array.from(document.querySelectorAll('button, .btn, .button'));
                return allBtns.some(b => b.innerText && b.innerText.toLowerCase().includes('stop') && b.style.display !== 'none');
            }, { timeout: 15000 });
            
            await this.page.evaluate(() => {
                const btn = document.querySelector('#stop');
                if (btn && btn.style.display !== 'none') { btn.click(); return; }
                const allBtns = Array.from(document.querySelectorAll('button, .btn, .button'));
                const stopBtn = allBtns.find(b => b.innerText && b.innerText.toLowerCase().includes('stop') && b.style.display !== 'none');
                if (stopBtn) stopBtn.click();
            });

            let checkCount = 0;
            while (checkCount < 60) {
                const statusText = await this.page.evaluate(() => {
                    const statusEl = document.querySelector('.statuslabel-label');
                    return statusEl ? statusEl.innerText.trim().toLowerCase() : '';
                });
                
                if (progressCallback && statusText) progressCallback(statusText);

                if (statusText === 'offline') return { success: true, status: 'offline' };
                
                await delay(5000); 
                checkCount++;
            }
            throw new Error('Server stop timed out.');
        } catch (err) {
            await this.page.screenshot({ path: 'debug_stop.png' });
            throw new Error('Error finding or clicking the Stop button. Server might already be offline.');
        }
    }

    /**
     * Closes the browser
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = { AternosClient };
