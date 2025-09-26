

console.log("Safe Browsing Guardian content script loaded");


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAFETY_CHECK_RESULT") {
    console.log("Received safety check result:", message.result);
    showSafetyPopup(message.url, message.result);
  }
});


function showSafetyPopup(url, result) {
  
  const oldPopup = document.querySelector(".safety-popup");
  if (oldPopup) oldPopup.remove();


  const popup = document.createElement("div");
  popup.className = "safety-popup";

  const status = result.safe
    ? `<span class="safe">✅ This site looks safe</span>`
    : `<span class="unsafe">⚠️ ${result.message}</span>`;

 
  popup.innerHTML = `
    <div class="popup-header">
      <span class="popup-title">🔒 Safe Browsing Guardian</span>
      <button class="popup-close">✖</button>
    </div>
    <div class="popup-body">
      <div class="popup-url">${url}</div>
      <div class="popup-status">${status}</div>
    </div>
  `;

  document.body.appendChild(popup);

  
  popup.querySelector(".popup-close").addEventListener("click", () => {
    popup.remove();
  });

 
  injectPopupStyles();

 
  if (result.safe) {
    setTimeout(() => {
      if (document.body.contains(popup)) {
        popup.remove();
      }
    }, 4000);
  }
}


function injectPopupStyles() {
  if (document.getElementById("safety-popup-styles")) return;

  const style = document.createElement("style");
  style.id = "safety-popup-styles";
  style.textContent = `
    .safety-popup {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      background: #fff;
      border: 2px solid #ccc;
      border-radius: 12px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
      font-family: Arial, sans-serif;
      z-index: 999999;
      animation: fadeIn 0.3s ease-in-out;
    }
    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f5f5f5;
      padding: 8px 12px;
      border-bottom: 1px solid #ddd;
      border-radius: 10px 10px 0 0;
      font-weight: bold;
    }
    .popup-title {
      font-size: 14px;
    }
    .popup-close {
      background: transparent;
      border: none;
      font-size: 16px;
      cursor: pointer;
      color: #666;
    }
    .popup-close:hover {
      color: #000;
    }
    .popup-body {
      padding: 10px 12px;
      font-size: 13px;
    }
    .popup-url {
      font-size: 12px;
      color: #666;
      margin-bottom: 6px;
      word-break: break-all;
    }
    .safe {
      color: green;
      font-weight: bold;
    }
    .unsafe {
      color: red;
      font-weight: bold;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
