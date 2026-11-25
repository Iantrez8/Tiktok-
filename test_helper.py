import subprocess
import os

# Script to verify the Three.js scene and take screenshots at various screen sizes
script = """
const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.goto('http://localhost:8000/?demo=1', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: 'test_demo_view.png' });
    await browser.close();
})();
"""
print("Helper ready")
