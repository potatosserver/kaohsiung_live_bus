const fs = require('fs');

const API_URL = 'https://ibus.tbkc.gov.tw/ibus/graphql';
// 加入 User-Agent 模擬瀏覽器，並增加連線設定
const HEADERS = { 
    'Content-Type': 'application/json', 
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const GQL_QUERY = `query QUERY_SIDE_ROUTES($lang: String!) {
    routes(lang: $lang) {
        edges {
            node {
                id
                name
            }
        }
    }
}`;

// 等待函數
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (err) {
            console.log(`連線失敗 (第 ${i + 1} 次重試): ${err.message}`);
            if (i === retries - 1) throw err;
            await sleep(5000); // 失敗後等 5 秒再試
        }
    }
}

async function main() {
    try {
        console.log('正在從高雄市政府 API 載入所有路線...');
        
        const result = await fetchWithRetry(API_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ query: GQL_QUERY, variables: { lang: "zh" } })
        });

        if (!result.data || !result.data.routes) {
            throw new Error('API 回傳格式異常');
        }

        const routes = result.data.routes.edges.map(edge => edge.node).filter(route => route.id !== 0);
        const sitemapContent = generateSitemap(routes);
        
        fs.writeFileSync('sitemap.xml', sitemapContent);
        console.log(`成功！已抓取 ${routes.length} 條路線，Sitemap.xml 已更新。`);

    } catch (error) {
        console.error('最終執行錯誤：', error);
        process.exit(1);
    }
}

function generateSitemap(routes) {
    const baseUrl = 'https://kaohsiung-live-bus.pages.dev/';
    const today = new Date().toISOString().split('T')[0];
    let urls = `
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;
    
    routes.forEach(route => {
        const routeUrl = `${baseUrl}?page=tracker&amp;route=${route.id}`;
        urls += `
  <url>
    <loc>${routeUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

main();
