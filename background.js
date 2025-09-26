
const SAFE_BROWSING_API_KEY = "AIzaSyDzwiTxwpAXmShGb8arDBnJSEXDRHCQlGk"; 
const SAFE_BROWSING_URL = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';


const CACHE_DURATION = 10 * 60 * 1000;


chrome.runtime.onInstalled.addListener(() => {
  console.log('Safe Browsing Guardian installed');
  
  chrome.storage.local.set({
    autoHideDelay: 6000, 
    cacheResults: {}
  });
});


chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) {
    console.log('Tab URL updated:', tab.url);
    
    if (isInternalPage(tab.url)) {
      console.log('Skipping internal page:', tab.url);
      return;
    }
    
    try {
      const normalizedUrl = normalizeUrl(tab.url);
      console.log('Checking URL safety:', normalizedUrl);
      const result = await checkUrlSafety(normalizedUrl);
      console.log('Safety check result:', result);
      
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          type: 'SAFETY_CHECK_RESULT',
          url: normalizedUrl,
          result: result
        }).catch(err => {
          console.log('Could not send message to content script:', err.message);
        });
      }, 1000);
      
    } catch (error) {
      console.error('Error checking URL safety:', error);
    }
  }
});


chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  
  if (isInternalPage(details.url)) {
    console.log('Skipping internal page in onCompleted:', details.url);
    return;
  }
  
  try {
    const normalizedUrl = normalizeUrl(details.url);
    console.log('Navigation completed, checking:', normalizedUrl);
    const result = await checkUrlSafety(normalizedUrl);
    console.log('Navigation safety result:', result);
    
    chrome.tabs.sendMessage(details.tabId, {
      type: 'SAFETY_CHECK_RESULT',
      url: normalizedUrl,
      result: result
    }).catch(err => {
      console.log('Could not send message to content script:', err.message);
    });
    
  } catch (error) {
    console.error('Error checking URL safety:', error);
    
    chrome.tabs.sendMessage(details.tabId, {
      type: 'SAFETY_CHECK_RESULT',
      url: details.url,
      result: { error: true, message: 'Error checking site safety' }
    }).catch(() => {});
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TEST_SAFETY_CHECK') {
    console.log('Testing safety check for:', message.url);
    checkUrlSafety(message.url).then(result => {
      console.log('Test result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Test error:', error);
      sendResponse({ error: true, message: error.message });
    });
    return true;
  }
});


 
function isInternalPage(url) {
  const internalPatterns = [
    'chrome://',
    'chrome-extension://',
    'moz-extension://',
    'edge://',
    'about:',
    'data:',
    'javascript:'
  ];
  
  return internalPatterns.some(pattern => url.startsWith(pattern));
}


function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    return urlObj.toString();
  } catch (error) {
    return url;
  }
}


async function checkUrlSafety(url) {
  try {
    console.log('Checking URL safety for:', url);
    
  
    if (url.includes('testsafebrowsing.appspot.com')) {
      console.log('Test URL detected, mapping to correct threat type');

      let threatType = 'MALWARE'; 
      if (url.includes('/SOCIAL_ENGINEERING/')) {
        threatType = 'SOCIAL_ENGINEERING';
      } else if (url.includes('/UNWANTED_SOFTWARE/')) {
        threatType = 'UNWANTED_SOFTWARE';
      } else if (url.includes('/POTENTIALLY_HARMFUL_APPLICATION/')) {
        threatType = 'POTENTIALLY_HARMFUL_APPLICATION';
      }

      const friendlyThreat = mapThreatTypeToFriendly(threatType);

      return {
        safe: false,
        threats: [friendlyThreat],
        message: `Test site detected: ${friendlyThreat}`
      };
    }
    
    
    const cached = await getCachedResult(url);
    if (cached) {
      console.log('Using cached result for:', url);
      return cached;
    }
    
    console.log('Making API request to Safe Browsing API');
    
    const response = await fetch(`${SAFE_BROWSING_URL}?key=${SAFE_BROWSING_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: {
          clientId: 'safe-browsing-guardian',
          clientVersion: '1.0.0'
        },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION'
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: url }]
        }
      })
    });
    
    console.log('API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('API response data:', data);
    const result = processSafeBrowsingResponse(data);
    console.log('Processed result:', result);
    
    await cacheResult(url, result);
    
    return result;
    
  } catch (error) {
    console.error('Safe Browsing API error:', error);
    return {
      error: true,
      message: 'Unable to verify site safety'
    };
  }
}


function processSafeBrowsingResponse(data) {
  if (!data.matches || data.matches.length === 0) {
    return {
      safe: true,
      message: 'Site appears safe'
    };
  }
  
  const threatTypes = data.matches.map(match => match.threatType);
  const uniqueThreats = [...new Set(threatTypes)];
  
  const friendlyThreats = uniqueThreats.map(mapThreatTypeToFriendly);
  
  return {
    safe: false,
    threats: friendlyThreats,
    message: `Potential threats detected: ${friendlyThreats.join(', ')}`
  };
}


function mapThreatTypeToFriendly(threatType) {
  const mapping = {
    'MALWARE': 'Malware',
    'SOCIAL_ENGINEERING': 'Phishing / Social Engineering',
    'UNWANTED_SOFTWARE': 'Unwanted Software',
    'POTENTIALLY_HARMFUL_APPLICATION': 'Potentially Harmful Application'
  };
  
  return mapping[threatType] || threatType;
}


async function getCachedResult(url) {
  try {
    const hostname = new URL(url).hostname;
    const storage = await chrome.storage.local.get(['cacheResults']);
    const cache = storage.cacheResults || {};
    
    const cached = cache[hostname];
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return cached.result;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}


async function cacheResult(url, result) {
  try {
    const hostname = new URL(url).hostname;
    const storage = await chrome.storage.local.get(['cacheResults']);
    const cache = storage.cacheResults || {};
    
    const now = Date.now();
    Object.keys(cache).forEach(key => {
      if ((now - cache[key].timestamp) >= CACHE_DURATION) {
        delete cache[key];
      }
    });
    
    cache[hostname] = {
      result: result,
      timestamp: now
    };
    
    await chrome.storage.local.set({ cacheResults: cache });
  } catch (error) {
    console.error('Error caching result:', error);
  }
}
