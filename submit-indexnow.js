const fs = require('fs');

async function submit() {
  const host = 'kaohsiung-live-bus.pages.dev';
  const key = 'db06e1c39f8543f5ad3e57a1417b1341';
  const sitemapPath = './sitemap.xml';

  try {
    if (!fs.existsSync(sitemapPath)) {
      console.error('找不到 sitemap.xml');
      process.exit(1);
    }

    const content = fs.readFileSync(sitemapPath, 'utf8');
    const urls = content.match(/<loc>(.*?)<\/loc>/g)
      .map(val => val.replace(/<\/?loc>/g, ''));

    console.log(`正在推播 ${urls.length} 個網址至 IndexNow...`);

    const response = await fetch('https://www.bing.com/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: host,
        key: key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: urls
      })
    });

    if (response.ok) {
      console.log('✅ IndexNow 推播成功！');
    } else {
      const errText = await response.text();
      console.error('❌ IndexNow 推播失敗:', errText);
      process.exit(1);
    }
  } catch (error) {
    console.error('執行出錯:', error);
    process.exit(1);
  }
}

submit();
