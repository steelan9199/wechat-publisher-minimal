import yargs from "yargs";
import { EOL } from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";
import { SKILL_ROOT } from "./tools/skill-root.js";
import {
  getAccessToken,
  checkAndRefreshToken,
  uploadContentImage,
  uploadCoverImage,
  fixListItemsWithExtraText,
  checkFileExists,
} from "./tools/service.js";
import {
  getListitemRenderer,
  getTextRenderer,
  getCodeRenderer,
  getHeadingRenderer,
  getImageRenderer,
  getBlockquoteRenderer,
  getSpaceRenderer,
  getHrRenderer,
  getBrRenderer,
  getDelRenderer,
  getLinkRenderer,
  getStrongRenderer,
  getEmRenderer,
  getTableRenderer,
} from "./tools/renderer.js";
import {
  getHighlightExtension,
  getDialogueExtension,
  getNestedBoldItalicExtension,
} from "./tools/extension.js";
import { processFormulas, hasFormula } from "./tools/formula-renderer.js";
import { setCurrentTheme, getAvailableThemes } from "./tools/theme.js";

// 心跳保活：长耗时操作期间每 2.5 秒输出进度日志，
// 防止 AI 客户端终端捕获因"无活动超时"（约 5 秒无输出即休眠）而丢失末段日志。
function withHeartbeat(task, label, intervalMs = 2000) {
  let i = 0;
  const timer = setInterval(
    () => console.error(`[progress] ${label} 进行中... ${++i}`),
    intervalMs,
  );
  return task.finally(() => clearInterval(timer));
}

/**
 * 预处理 Markdown 内容，将 Obsidian 风格的 TOC（Table of Contents）转换为普通列表
 * 将 Wiki 链接 [[文件名##标题|显示文本]] 转换为普通文本
 * 处理嵌套列表，避免数字重复
 * @param {string} content - 原始 Markdown 内容
 * @returns {string} - 处理后的内容
 */
function convertTOCToPlainList(content) {
  // 匹配 Obsidian 风格的 TOC 块
  // 格式：<!-- Table of Contents ... --> ... <!-- End of TOC -->
  const tocRegex =
    /<!--\s*Table of Contents[\s\S]*?-->([\s\S]*?)<!--\s*End of TOC\s*-->/gi;

  return content.replace(tocRegex, (match, tocContent) => {
    // 将 Wiki 链接 [[文件名##标题|显示文本]] 转换为普通文本
    // 只保留显示文本部分
    let plainList = tocContent.replace(
      /\[\[[^\]]+\|([^\]]+)\]\]/g,
      (wikiMatch, displayText) => {
        // 如果显示文本以数字开头（如 "1. 插件迁移"），移除数字前缀
        return displayText.replace(/^\d+\.\s*/, "");
      },
    );
    return plainList;
  });
}

/**
 * 预处理 Markdown 内容，确保 ** 和 __ 强调语法能被正确解析
 * 在 ** 和 __ 前后添加零宽空格，帮助 marked 识别 strong token
 * 特殊处理：不在加粗斜体组合语法中间添加零宽空格
 * @param {string} content - 原始 Markdown 内容
 * @returns {string} - 处理后的内容
 */
function preprocessMarkdownStrong(content) {
  const imageRegex =
    /!\[(.*?)\]\((?:<([^>]*)>|((?:[^()]*|\([^()]*\))*))\)/g;
  let processedContent = "";
  let lastIndex = 0;

  for (const match of content.matchAll(imageRegex)) {
    processedContent += preprocessMarkdownStrongText(
      content.slice(lastIndex, match.index),
    );
    processedContent += match[0];
    lastIndex = match.index + match[0].length;
  }

  return (
    processedContent + preprocessMarkdownStrongText(content.slice(lastIndex))
  );
}

function preprocessMarkdownStrongText(content) {
  // 在 ** 前后添加零宽空格，确保 marked 能正确识别 strong 语法
  // 但要避免破坏加粗斜体组合语法：
  // - ***text*** (三星号)
  // - **_text_** (双星号+下划线)
  // - _**text**_ (下划线+双星号)
  let prevContent;
  do {
    prevContent = content;
    // 在 ** 前添加零宽空格（排除星号和下划线，保护 _** 和 *** 组合）
    content = content.replace(/([^\s\u200B*_])\*\*/g, "$1\u200B**");
    // 在 ** 后添加零宽空格（排除星号和下划线，保护 **_ 和 *** 组合）
    content = content.replace(/\*\*([^\s\u200B*_])/g, "**\u200B$1");
  } while (content !== prevContent);

  // 处理 __ 符号（下划线强调语法）
  // 避免破坏加粗斜体组合语法：
  // - __*text*__ (双下划线+星号)
  // - *__text__* (星号+双下划线)
  do {
    prevContent = content;
    // 在 __ 前添加零宽空格（排除下划线和星号，保护 *__ 组合）
    content = content.replace(/([^\s\u200B_*])__(?!_)/g, "$1\u200B__");
    // 在 __ 后添加零宽空格（排除下划线和星号，保护 __* 组合）
    content = content.replace(/__([^\s\u200B_*])/g, "__\u200B$1");
  } while (content !== prevContent);

  return content;
}

async function getMergedConfig() {
  const config_inner = {
    debug: false,
    TOKEN_FILE_PATH: path.join(SKILL_ROOT, "wechat-token.json"),
    markedOptions: {
      async: false,
      gfm: true, // 启用GitHub Flavored Markdown以支持表格
      breaks: false,
      pedantic: false,
      silent: false,
    },
  };
  const argv = yargs(process.argv.slice(2)).parse();
  const configFilePath =
    argv.config || path.join(SKILL_ROOT, "config.default.json");
  const mcpWechatOfficialAccountConfig = JSON.parse(
    await readFile(configFilePath, "utf-8"),
  );
  const mergedConfig = { ...config_inner, ...mcpWechatOfficialAccountConfig };
  return mergedConfig;
}

async function publishToWechat(mergedConfig, marked) {
  const localMarkdownFilePath = mergedConfig.markdownFilePath;

  // 检查markdown文件是否存在
  if (!(await checkFileExists(localMarkdownFilePath))) {
    throw new Error(`Markdown文件不存在: ${localMarkdownFilePath}`);
  }

  // 获取访问令牌
  const accessToken = await checkAndRefreshToken(mergedConfig);

  // 读取并处理 Markdown 内容
  let markdownContent = await readFile(localMarkdownFilePath, "utf-8");

  // 统一换行符为 \n，后续所有处理均使用 \n
  markdownContent = markdownContent.replace(/\r\n/g, "\n");

  // 将 TOC 转换为普通列表，将 Wiki 链接转换为普通文本
  markdownContent = convertTOCToPlainList(markdownContent);

  // 预处理 ** 强调语法，确保 marked 能正确解析
  markdownContent = preprocessMarkdownStrong(markdownContent);

  // 处理公式 - 在 Markdown 转换前将公式转换为 SVG
  if (hasFormula(markdownContent)) {
    markdownContent = await processFormulas(markdownContent);
  }

  markdownContent = fixListItemsWithExtraText(markdownContent);

  // 处理本地图片上传
  // 正则支持两种路径语法：
  // 1. 普通语法，路径中可包含成对括号：![](图片(1).png)
  // 2. CommonMark 尖括号语法：![](<图片(1).png>)
  const imageRegex =
    /!\[(.*?)\]\((?!http)(?:<([^>]*)>|((?:[^()]*|\([^()]*\))*))\)/g;
  const matches = Array.from(markdownContent.matchAll(imageRegex));

  if (matches.length > 0) {
    for (let imgIdx = 0; imgIdx < matches.length; imgIdx++) {
      const match = matches[imgIdx];
      const markdownTag = match[0];
      const altText = match[1];
      // match[2] 为尖括号语法的路径，match[3] 为普通语法的路径
      const localPath = match[2] !== undefined ? match[2] : match[3];
      const lineNumber = markdownContent
        .slice(0, match.index)
        .split("\n").length;

      // 处理相对路径和绝对路径
      let absolutePath = path.isAbsolute(localPath)
        ? localPath
        : path.resolve(path.dirname(localMarkdownFilePath), localPath);
      // 对图片路径中的 URL 编码进行解码，兼容不同 Markdown 编辑器生成的链接
      try {
        absolutePath = decodeURIComponent(absolutePath);
      } catch {
        // 解码失败时保持原样
      }

      // 本地图片若不存在，直接终止并提示用户
      if (!(await checkFileExists(absolutePath))) {
        throw new Error(
          `图片文件不存在: ${absolutePath}\nMarkdown 第 ${lineNumber} 行的图片路径: ${localPath}\n请更换为正确的图片路径。`,
        );
      }

      const wechatUrl = await withHeartbeat(
        uploadContentImage(absolutePath, accessToken, mergedConfig),
        `上传图片 ${imgIdx + 1}/${matches.length}`,
      );
      console.error(
        `✅ 图片上传完成 ${imgIdx + 1}/${matches.length}: ${path.basename(absolutePath)}`,
      );
      markdownContent = markdownContent.replace(
        markdownTag,
        `![${altText}](${wechatUrl})`,
      );
    }
  } else {
  }

  // 上传封面图片
  let coverImagePath = path.join(SKILL_ROOT, "cover.jpg");
  let defaultCoverImagePath = coverImagePath;
  if (mergedConfig.coverFilePath) {
    if (await checkFileExists(mergedConfig.coverFilePath)) {
      if (
        mergedConfig.coverFilePath.endsWith(".jpg") ||
        mergedConfig.coverFilePath.endsWith(".png")
      ) {
        coverImagePath = mergedConfig.coverFilePath;
        console.error(`使用封面图片: ${path.resolve(coverImagePath)}`);
      } else {
        console.error(`⚠️  警告: 封面图片格式不支持!`);
        console.error(`   用户指定的封面图片: ${mergedConfig.coverFilePath}`);
        console.error(`   公众号支持的封面图片格式: .jpg, .png`);
        console.error(`   将使用默认封面图片: ${defaultCoverImagePath}`);
        console.error(
          `   您可以使用skill[webp-to-jpg]或者其他[图片格式转换工具], 将其他格式的图片转换为.jpg或.png格式后, 就可以使用您指定的封面图片了`,
        );
        coverImagePath = defaultCoverImagePath;
      }
    } else {
      if (mergedConfig.coverFilePath === "./cover.jpg") {
        coverImagePath = defaultCoverImagePath;
      } else {
        console.error(
          `封面图片不存在: ${path.resolve(coverImagePath)}\n\n使用默认封面图片 ${defaultCoverImagePath}`,
        );
        coverImagePath = defaultCoverImagePath;
      }
    }
  } else {
    coverImagePath = defaultCoverImagePath;
  }

  let thumbMediaId =
    "mVlTzdG84QF_OwEOKtacolOthlXTrmZjm67GTL5lYbw9mfHyxJtHwt7SUKTymDfJ";
  if (!mergedConfig.debug) {
    thumbMediaId = await withHeartbeat(
      uploadCoverImage(coverImagePath, accessToken, mergedConfig),
      "上传封面图片",
    );
  }
  // 优先使用 config.json 中的 title，如果没有则使用文件名作为备选
  let title = mergedConfig.title || path.basename(localMarkdownFilePath, ".md");
  // 去除公众号标题中不允许的特殊符号
  title = title.replace(/[<>:"/\|?*#`{}\[\]()~!@\$%^&+=\\;,']"/g, "");
  // 如果 config.json 中没有提供 title，则告知用户将使用文件名作为标题
  if (mergedConfig.title) {
    console.error(`公众号文章标题: ${title}`);
  } else {
    console.error(`未在配置中提供标题，将使用文件名作为标题: ${title}`);
  }

  // 转换 Markdown 为 HTML
  // var prefix = await readFile("./前缀.md", "utf-8");
  // var suffix = await readFile("./后缀.md", "utf-8");
  var prefix = mergedConfig.prefix;
  var suffix = mergedConfig.suffix;

  if (!mergedConfig.debug) {
    const parts = [];
    if (prefix) parts.push(prefix);
    parts.push(markdownContent);
    if (suffix) parts.push(suffix);
    markdownContent = parts.join("\n");
  }
  let htmlContent = await marked.parse(
    markdownContent,
    mergedConfig.markedOptions,
  );
  htmlContent = htmlContent.trim();
  // 添加全局字体大小和行间距样式包装器
  htmlContent = `<section style="font-size: 15px;text-align: left; line-height: 1.75; color: #595959;">${htmlContent}</section>`;

  // // 调试输出：查看发送给微信 API 的 HTML 内容
  // console.error("\n========== DEBUG: 生成的 HTML 内容 ==========");
  // console.error(htmlContent);
  // console.error("========== DEBUG END ==========\n");

  // 创建微信公众号草稿
  console.error("正在创建微信公众号草稿...");
  let draftUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`;

  const draftData = {
    articles: [
      {
        title: title,
        author: mergedConfig.AUTHOR,
        content: htmlContent,
        thumb_media_id: thumbMediaId,
        show_cover_pic: 1,
      },
    ],
  };

  let draftResponse = await fetch(draftUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Connection: "close" },
    body: JSON.stringify(draftData),
  });

  let draftResult = await draftResponse.json();

  // 检查是否是token失效错误，如果是则重新获取token并重试
  if (
    !draftResponse.ok ||
    (draftResult.errcode &&
      (draftResult.errcode === 40001 ||
        draftResult.errmsg.includes("invalid credential")))
  ) {
    if (
      draftResult.errcode === 40001 ||
      draftResult.errmsg.includes("invalid credential")
    ) {
      // 重新获取token
      const newAccessToken = await getAccessToken(mergedConfig);
      // 使用新token重试
      draftUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${newAccessToken}`;
      draftResponse = await fetch(draftUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(draftData),
      });
      draftResult = await draftResponse.json();
    }
  }

  if (draftResponse.ok && draftResult.media_id) {
    return {
      success: true,
      mediaId: draftResult.media_id,
      message: "成功创建微信公众号草稿",
    };
  } else {
    throw new Error(`创建微信公众号草稿失败: ${JSON.stringify(draftResult)}`);
  }
}

function getMarked(mergedConfig) {
  // 初始化 marked
  const marked = new Marked();

  // 根据配置设置当前主题
  const themeName = mergedConfig.theme || "blue";

  // 前置检查：默认主题 blue 必须存在，否则 theme.js 会无限递归
  const availableThemes = getAvailableThemes();
  if (!availableThemes.includes("blue")) {
    throw new Error(
      `默认主题 "blue" 不存在，无法继续。可用主题: ${availableThemes.join(", ") || "无"}。请检查 themes/ 目录路径是否正确。`,
    );
  }

  if (!availableThemes.includes(themeName)) {
    console.error(`主题 "${themeName}" 不存在，将使用默认主题 "blue"`);
    setCurrentTheme("blue");
  } else {
    setCurrentTheme(themeName);
  }

  // 初始化各种渲染器 (传递主题配置)
  const listitemRenderer = getListitemRenderer();
  const codeRenderer = getCodeRenderer(null, themeName);
  const imageRenderer = getImageRenderer();
  const blockquoteRenderer = getBlockquoteRenderer();
  const spaceRenderer = getSpaceRenderer();
  const headingRenderer = getHeadingRenderer();
  const hrRenderer = getHrRenderer();
  const brRenderer = getBrRenderer();
  const delRenderer = getDelRenderer();
  const linkRenderer = getLinkRenderer();
  const textRenderer = getTextRenderer();
  const tableRenderer = getTableRenderer();
  const strongRenderer = getStrongRenderer();
  const emRenderer = getEmRenderer();
  const highlightExtension = getHighlightExtension();
  const dialogueExtension = getDialogueExtension();
  const nestedBoldItalicExtension = getNestedBoldItalicExtension();

  marked.use(
    headingRenderer,
    textRenderer,
    imageRenderer,
    listitemRenderer,
    codeRenderer,
    blockquoteRenderer,
    spaceRenderer,
    hrRenderer,
    brRenderer,
    delRenderer,
    linkRenderer,
    tableRenderer,
    strongRenderer,
    emRenderer,
    {
      extensions: [
        highlightExtension,
        dialogueExtension,
        nestedBoldItalicExtension,
      ],
    },
  );
  return marked;
}

async function main() {
  const mergedConfig = await getMergedConfig();

  // 已授权（付费或试用中）-> 静默运行，不打扰用户
  const marked = getMarked(mergedConfig);
  // 心跳保活：publishToWechat 是长耗时操作（含网络请求），期间存在静默段，
  // 用心跳维持终端输出捕获活跃，确保末段"发布结果"日志不丢失
  const result = await withHeartbeat(
    publishToWechat(mergedConfig, marked),
    "发布到微信公众号",
  );
  console.error("发布结果:", JSON.stringify(result, null, 2));
  return;
  // // 强制退出进程，解决混淆后 MathJax 资源未释放导致进程挂起的问题
  // setTimeout(() => process.exit(0), 100);
}

main().catch((err) => {
  console.error(`发布失败: ${err.message}`);
  process.exitCode = 1;
});
