const fs = require('fs');

const API_URL = 'https://ibus.tbkc.gov.tw/ibus/graphql';
const HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
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

async function main() {
    try {
        console.log('正在從高雄市政府 API 載入所有路線...');
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ query: GQL_QUERY, variables: { lang: "zh" } })
        });

        if (!response.ok) throw new Error(`API 請求失敗，狀態碼: ${response.status}`);
        
        const result = await response.json();
        const routes = result.data.routes.edges.map(edge => edge.node).filter(route => route.id !== 0);
        
        const sitemapContent = generateSitemap(routes);
        
        // 將結果寫入檔案 (假設你的網站根目錄需要 sitemap.xml)
        fs.writeFileSync('sitemap.xml', sitemapContent);
        console.log('成功！Sitemap.xml 已成功生成與更新。');

    } catch (error) {
        console.error('發生錯誤：', error);
        process.exit(1); // 讓 GitHub Actions 知道執行失敗
    }
}

function generateSitemap(routes) {
    const baseUrl = 'https://kaohsiung-live-bus.pages.dev/';
    const today = new Date().toISOString().split('T')[0];

    let urls = '';
    
    // 首頁
    urls += `
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;
    
    // 各路線頁面
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