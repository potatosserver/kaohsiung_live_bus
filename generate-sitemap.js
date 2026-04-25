const fs = require('fs');

async function main() {
    try {
        const filePath = 'sitemap.xml';
        
        // 1. 檢查檔案是否存在
        if (!fs.existsSync(filePath)) {
            console.error('錯誤：找不到 sitemap.xml 檔案，請先手動建立並上傳。');
            process.exit(1);
        }

        // 2. 讀取現有的 sitemap.xml
        let content = fs.readFileSync(filePath, 'utf8');

        // 3. 取得今天的日期 (YYYY-MM-DD)
        const today = new Date().toISOString().split('T')[0];
        console.log(`正在將 Sitemap 日期更新為: ${today}`);

        // 4. 使用正規表達式取代所有的 <lastmod> 內容
        // 找尋 <lastmod>...</lastmod> 並替換
        const updatedContent = content.replace(
            /<lastmod>.*?<\/lastmod>/g, 
            `<lastmod>${today}</lastmod>`
        );

        // 5. 寫回檔案
        fs.writeFileSync(filePath, updatedContent);
        console.log('成功！sitemap.xml 日期已更新。');

    } catch (error) {
        console.error('執行失敗：', error.message);
        process.exit(1);
    }
}

main();
