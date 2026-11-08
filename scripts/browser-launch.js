exports.chromiumBrowser=()=>({chromium:require('playwright').chromium,launchOptions:process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}: {}});
