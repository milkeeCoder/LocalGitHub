const BASE_URL = "https://ma-ji.ai";
const ARTICLES_PAGE = "https://ma-ji.ai"; // 一覧ページ
const DRIVE_FOLDER_ID = "1vY6-WZ9dgIbSMt_r-nF4uulL2j9q8Z3X";

// LINE Messaging API
const LINE_CHANNEL_ACCESS_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN";
const LINE_TO_ID = "YOUR_LINE_TO_ID";

/*
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("OK");
    }
    const data = JSON.parse(e.postData.contents);
    Logger.log(JSON.stringify(data, null, 2));
    return ContentService.createTextOutput("OK");
  } catch (err) {
    // 例外が起きても 200 を返す（LINE検証のため）
    return ContentService.createTextOutput("OK");
  }
}

function doGet() {
  return ContentService.createTextOutput("OK");
}

function testLineNotify() {
  sendLineMessage("テスト通知です。LINE通知が届けばOK！");
}
*/

function runDaily() {
  const newArticles = fetchNewArticles();
  if (newArticles.length === 0) {
    sendLineMessage("今日の新規記事はありませんでした。");
    Logger.log("新規記事なし");
    return;
  }

  newArticles.forEach(article => {
    const content = fetchArticleContent(article.url);
    const docUrl = createDoc(article.title, content);

    sendLineMessage(
      `新規記事追加: ${article.title}\n${article.url}\nDocs: ${docUrl}`
    );
  });
}

// 1. 記事一覧から新規記事を抽出
function fetchNewArticles() {
  const html = UrlFetchApp.fetch(ARTICLES_PAGE).getContentText("UTF-8");

  // 記事URL抽出（例: /articles/xxxx）
  const regex = /href="(\/articles\/[^\"]+)"/g;
  let match;
  const urls = new Set();

  while ((match = regex.exec(html)) !== null) {
    urls.add(BASE_URL + match[1]);
  }

  const stored = getStoredUrls();
  const newOnes = [];

  urls.forEach(url => {
    if (!stored.includes(url)) {
      newOnes.push({ url, title: "記事タイトル取得中..." });
    }
  });

  // タイトル取得
  newOnes.forEach(item => {
    const pageHtml = UrlFetchApp.fetch(item.url).getContentText("UTF-8");
    const titleMatch = pageHtml.match(/<title>(.*?)<\/title>/);
    if (titleMatch) item.title = titleMatch[1].replace(" | まこなり社長のマジAI", "").trim();
  });

  // 新規URLを保存
  storeUrls([...stored, ...Array.from(urls)]);

  return newOnes;
}

// 2. 記事本文取得
function fetchArticleContent(url) {
  const html = UrlFetchApp.fetch(url).getContentText("UTF-8");

  // 原因: class属性が完全一致でないと本文抽出に失敗し、空文書になる。
  // まずは class を部分一致で探し、なければ最初の <article> を使う。
  const specificArticleMatch = html.match(/<article[^>]*class="[^"]*gap-6[^"]*"[^>]*>([\s\S]*?)<\/article>/i);
  const genericArticleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const articleHtml = (specificArticleMatch || genericArticleMatch)?.[1];

  if (!articleHtml) {
    return "本文を取得できませんでした。";
  }

  const paragraphs = [];
  const textTagRegex = /<(p|h1|h2|h3|h4|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;

  while ((m = textTagRegex.exec(articleHtml)) !== null) {
    const text = sanitizeText(m[2]);
    if (text) paragraphs.push(text);
  }

  // 画像URL抽出
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  while ((m = imgRegex.exec(articleHtml)) !== null) {
    paragraphs.push(`[画像] ${m[1]}`);
  }

  // pタグが存在しない記事向けフォールバック（タグ除去して本文化）
  if (paragraphs.length === 0) {
    const fallbackText = sanitizeText(articleHtml);
    if (fallbackText) return fallbackText;
  }

  return paragraphs.join("\n\n");
}

function sanitizeText(htmlText) {
  return htmlText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// 3. Google Docs作成
function createDoc(title, content) {
  const doc = DocumentApp.create(title);
  doc.getBody().setText(content);

  const file = DriveApp.getFileById(doc.getId());
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  return doc.getUrl();
}

// 4. LINE通知
function sendLineMessage(message) {
  const url = "https://api.line.me/v2/bot/message/push";

  const payload = {
    to: LINE_TO_ID,
    messages: [{ type: "text", text: message }]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify(payload)
  };

  UrlFetchApp.fetch(url, options);
}

// URL保存/取得
function getStoredUrls() {
  const props = PropertiesService.getScriptProperties();
  const data = props.getProperty("storedUrls");
  return data ? JSON.parse(data) : [];
}

function storeUrls(urls) {
  PropertiesService.getScriptProperties().setProperty("storedUrls", JSON.stringify(urls));
}
