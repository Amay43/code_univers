const output = document.getElementById("codeOutput");
const preview = document.getElementById("previewFrame");
const cssOutput = document.getElementById("cssOutput");
const jsOutput = document.getElementById("jsOutput");
const statusMessage = document.getElementById("statusMessage");
const extractBtn = document.getElementById("extractBtn");
const btnText = document.getElementById("btnText");
const btnLoader = document.getElementById("btnLoader");

const proxies = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
  "https://cors-anywhere.herokuapp.com/"
];

async function extractCode() {
  const urlInput = document.getElementById("urlInput").value.trim();
  
  try {
    new URL(urlInput);
  } catch {
    showMessage("❌ Please enter a valid full URL (starting with https://)", "error");
    return;
  }

  // Show loading state
  btnText.textContent = "Extracting...";
  btnLoader.style.display = "inline-block";
  extractBtn.disabled = true;
  
  output.textContent = "⏳ Fetching HTML...";
  cssOutput.textContent = "⏳ Extracting CSS...";
  jsOutput.textContent = "⏳ Extracting JS...";
  statusMessage.textContent = "";
  statusMessage.className = "status-message";

  let success = false;
  
  for (let proxy of proxies) {
    try {
      showMessage(`🔄 Trying proxy: ${proxy}...`, "status");
      
      const proxyUrl = proxy + encodeURIComponent(urlInput);
      const res = await fetchWithTimeout(proxyUrl, {
        timeout: 10000
      });
      
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      
      const html = await res.text();
      output.textContent = formatHTML(html);

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Extract CSS
      const styles = Array.from(doc.querySelectorAll("style"))
        .map(el => el.textContent.trim())
        .filter(text => text.length > 0)
        .join("\n\n");

      const links = Array.from(doc.querySelectorAll("link[rel='stylesheet']"))
        .map(link => link.href || link.getAttribute("href"))
        .filter(Boolean)
        .map(href => `@import url("${href}");`)
        .join("\n");

      cssOutput.textContent = `/* Linked Stylesheets */\n${links}\n\n/* Inline Styles */\n${styles || "(none)"}`;

      // Extract JS
      const inlineScripts = Array.from(doc.querySelectorAll("script:not([src])"))
        .map(el => el.textContent.trim())
        .filter(text => text.length > 0)
        .join("\n\n");

      const externalScripts = Array.from(doc.querySelectorAll("script[src]"))
        .map(script => script.src || script.getAttribute("src"))
        .filter(Boolean)
        .join("\n");

      jsOutput.textContent = `// External JS:\n${externalScripts || "(none)"}\n\n// Inline JS:\n${inlineScripts || "(none)"}`;

      // Create preview with all resources
      await updatePreview(html, doc, urlInput);
      
      showMessage("✅ Successfully extracted code!", "success");
      success = true;
      break;
    } catch (err) {
      console.error(`Proxy ${proxy} failed:`, err);
      continue;
    }
  }

  if (!success) {
    output.textContent = "❌ Failed to fetch HTML. The site may block CORS.";
    cssOutput.textContent = "❌ Could not extract CSS.";
    jsOutput.textContent = "❌ Could not extract JS.";
    showMessage("❌ All proxies failed. The site may block CORS.", "error");
  }

  // Reset button state
  btnText.textContent = "Extract Code";
  btnLoader.style.display = "none";
  extractBtn.disabled = false;
}

function fetchWithTimeout(url, options = {}) {
  const { timeout = 8000 } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
}

function formatHTML(html) {
  // Simple HTML formatting for better readability
  return html
    .replace(/</g, "\n<")
    .replace(/>/g, ">\n")
    .replace(/\n\n/g, "\n")
    .trim();
}

async function updatePreview(html, originalDoc, baseUrl) {
  try {
    const previewDoc = preview.contentDocument || preview.contentWindow.document;
    previewDoc.open();
    
    // Create a new document with base tag to handle relative paths
    previewDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <base href="${baseUrl}">
          ${originalDoc.head.innerHTML}
        </head>
        <body>
          ${originalDoc.body.innerHTML}
        </body>
      </html>
    `);
    
    // Inject all styles and scripts
    await injectResources(previewDoc, originalDoc);
    
    previewDoc.close();
  } catch (err) {
    console.error("Error updating preview:", err);
    // Fallback to basic preview if full preview fails
    try {
      const previewDoc = preview.contentDocument || preview.contentWindow.document;
      previewDoc.open();
      previewDoc.write(html);
      previewDoc.close();
      showMessage("⚠️ Basic preview loaded (some resources may be blocked)", "error");
    } catch (fallbackErr) {
      console.error("Fallback preview failed:", fallbackErr);
      showMessage("❌ Could not load preview due to security restrictions", "error");
    }
  }
}

async function injectResources(previewDoc, originalDoc) {
  // Inject all style elements
  const styles = originalDoc.querySelectorAll('style');
  styles.forEach(style => {
    const newStyle = previewDoc.createElement('style');
    newStyle.textContent = style.textContent;
    previewDoc.head.appendChild(newStyle);
  });

  // Try to load external CSS
  const cssLinks = originalDoc.querySelectorAll('link[rel="stylesheet"]');
  for (const link of cssLinks) {
    try {
      const href = link.href;
      if (href) {
        const response = await fetch(href);
        const css = await response.text();
        const style = previewDoc.createElement('style');
        style.textContent = css;
        previewDoc.head.appendChild(style);
      }
    } catch (err) {
      console.error('Failed to load CSS:', err);
    }
  }

  // Inject all inline scripts
  const scripts = originalDoc.querySelectorAll('script:not([src])');
  scripts.forEach(script => {
    const newScript = previewDoc.createElement('script');
    newScript.textContent = script.textContent;
    previewDoc.body.appendChild(newScript);
  });

  // Try to load external JS
  const jsScripts = originalDoc.querySelectorAll('script[src]');
  for (const script of jsScripts) {
    try {
      const src = script.src;
      if (src) {
        const response = await fetch(src);
        const js = await response.text();
        const newScript = previewDoc.createElement('script');
        newScript.textContent = js;
        previewDoc.body.appendChild(newScript);
      }
    } catch (err) {
      console.error('Failed to load JS:', err);
    }
  }
}

function refreshPreview() {
  const urlInput = document.getElementById("urlInput").value.trim();
  if (urlInput && output.textContent && !output.textContent.includes("Waiting")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(output.textContent, "text/html");
    updatePreview(output.textContent, doc, urlInput);
  } else {
    showMessage("⚠️ Nothing to preview", "error");
  }
}

function openInNewTab() {
  const html = output.textContent;
  if (html && !html.includes("Waiting")) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    URL.revokeObjectURL(url);
  } else {
    showMessage("⚠️ Nothing to preview", "error");
  }
}

async function exportAsZip() {
  const btn = document.getElementById('zipBtn');
  const progress = btn.querySelector('.progress');
  
  if (!output.textContent || output.textContent.includes("Waiting") || output.textContent.includes("Failed")) {
    showMessage("⚠️ Nothing to export", "error");
    return;
  }
  
  try {
    btn.disabled = true;
    progress.style.width = '30%';
    
    const zip = new JSZip();
    const folder = zip.folder("website");
    
    // Add HTML file
    folder.file("index.html", output.textContent);
    progress.style.width = '50%';
    
    // Add CSS file
    const cssContent = cssOutput.textContent
      .replace('/* Linked Stylesheets */\n', '')
      .replace('\n\n/* Inline Styles */\n', '\n');
    folder.file("styles.css", cssContent);
    progress.style.width = '70%';
    
    // Add JS file
    const jsContent = jsOutput.textContent
      .replace('// External JS:\n', '')
      .replace('\n\n// Inline JS:\n', '\n');
    folder.file("scripts.js", jsContent);
    progress.style.width = '90%';
    
    // Generate the ZIP file
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "website-code.zip");
    
    progress.style.width = '100%';
    showMessage("✅ ZIP file downloaded successfully!", "success");
  } catch (error) {
    console.error("Error creating ZIP file:", error);
    showMessage("❌ Failed to create ZIP file", "error");
  } finally {
    setTimeout(() => {
      progress.style.width = '0%';
      btn.disabled = false;
    }, 1000);
  }
}

function downloadHTML() {
  if (!output.textContent || output.textContent.includes("Waiting") || output.textContent.includes("Failed")) {
    showMessage("⚠️ Nothing to download", "error");
    return;
  }
  
  try {
    const blob = new Blob([output.textContent], { type: "text/html" });
    saveAs(blob, "website.html");
    showMessage("✅ HTML file downloaded successfully!", "success");
  } catch (error) {
    console.error("Error downloading HTML:", error);
    showMessage("❌ Failed to download HTML", "error");
  }
}

function saveToLocal() {
  if (output.textContent.length > 20 && !output.textContent.includes("Waiting")) {
    localStorage.setItem("cloner-html", output.textContent);
    localStorage.setItem("cloner-css", cssOutput.textContent);
    localStorage.setItem("cloner-js", jsOutput.textContent);
    showMessage("✅ Code saved to local storage", "success");
  } else {
    showMessage("⚠️ Nothing to save", "error");
  }
}

function loadFromLocal() {
  const html = localStorage.getItem("cloner-html");
  const css = localStorage.getItem("cloner-css");
  const js = localStorage.getItem("cloner-js");
  
  if (html) {
    output.textContent = html;
    cssOutput.textContent = css;
    jsOutput.textContent = js;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    updatePreview(html, doc, document.getElementById("urlInput").value || "https://example.com");
    showMessage("🔄 Loaded from local storage", "success");
  } else {
    showMessage("ℹ️ No saved data found", "status");
  }
}

function clearAll() {
  output.textContent = "Waiting for input...";
  cssOutput.textContent = "Waiting for input...";
  jsOutput.textContent = "Waiting for input...";
  preview.srcdoc = "";
  document.getElementById("urlInput").value = "";
  showMessage("🔄 Cleared all content", "success");
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  createGradientBubbles(14);
}

function showMessage(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  setTimeout(() => {
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
  }, 5000);
}

function createGradientBubbles(count = 12) {
  const layer = document.getElementById('bubbleLayer');
  layer.innerHTML = '';
  
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (currentTheme !== 'light') return;

  const colors = ['#00ffe1', '#ff55e9', '#33ccff', '#ff99ff', '#b5f5ec', '#a1a1f5'];
  let bubbles = [];

  for (let i = 0; i < count; i++) {
    const size = 60 + Math.random() * 100;
    const top = Math.random() * 400;
    const left = Math.random() * 100;
    const speed = (5 + Math.random() * 8).toFixed(2);
    const glow = colors[Math.floor(Math.random() * colors.length)];
    const delay = (Math.random() * 10).toFixed(2);
    const depth = Math.random() * 60 - 30;
    bubbles.push({ size, top, left, speed, glow, delay, depth });
  }

  bubbles.sort((a, b) => a.size - b.size);

  for (const b of bubbles) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.width = `${b.size}px`;
    el.style.height = `${b.size}px`;
    el.style.top = `${b.top}px`;
    el.style.left = `${b.left}%`;
    el.style.setProperty('--speed', `${b.speed}s`);
    el.style.setProperty('--glow', b.glow);
    el.style.animationDelay = `${b.delay}s`;
    el.style.transform = `translateZ(${b.depth}px)`;
    layer.appendChild(el);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Typewriter effect
  const text = "> Code Cloner";
  const typedText = document.querySelector(".typed-text");
  let i = 0;
  function typeNext() {
    if (i <= text.length) {
      typedText.textContent = text.slice(0, i);
      i++;
      setTimeout(typeNext, 90);
    }
  }
  typeNext();

  // Set theme
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  
  // Create bubbles
  createGradientBubbles(14);
  
  // Load from local storage if available
  loadFromLocal();
  
  // Add event listener for Enter key
  document.getElementById("urlInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      extractCode();
    }
  });
});