const fs = require('fs');

async function pushSitemapToIndexNow() {
    const HOST = 'kaohsiung-live-bus.pages.dev';
    const KEY = 'db06e1c39f8543f5ad3e57a1417b1341';
    const SITEMAP_PATH = './sitemap.xml';

    try {
        // 1. 讀取 sitemap.xml 檔案
        if (!fs.existsSync(SITEMAP_PATH)) {
            console.error("找不到 sitemap.xml");
            return;
        }
        const sitemapContent = fs.readFileSync(SITEMAP_PATH, 'utf8');

        // 2. 使用正規表達式提取所有 <loc> 標籤內的網址
        const urlMatch = sitemapContent.match(/<loc>(.*?)<\/loc>/g);
        if (!urlMatch) {
            console.error("sitemap.xml 中沒有找到任何網址");
            return;
        }

        const urls = urlMatch.map(loc => loc.replace(/<\/?loc>/g, '').trim());
        console.log(`從 sitemap 中提取了 ${urls.length} 個網址`);

        // 3. 提交給 IndexNow (Bing)
        const response = await fetch('https://www.bing.com/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                host: HOST,
                key: KEY,
                keyLocation: `https://${HOST}/${KEY}.txt`,
                urlList: urls
            })
        });

        if (response.ok) {
            console.log("✅ IndexNow 推播成功！所有 Sitemap 網址已送出。");
        } else {
            console.error("❌ 推播失敗:", await response.text());
        }
    } catch (error) {
        console.error("執行發生錯誤:", error);
    }
}

pushSitemapToIndexNow();
