import { load } from "cheerio";
import path from "node:path";
import { readFile, writeFile, access, constants } from "node:fs/promises";

/**
 * 检查文件是否存在
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} - 文件是否存在
 */
export async function checkFileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function removeAsterisksIfExactlyFour(inputString) {
  // 计算字符串中星号的数量
  const asteriskCount = (inputString.match(/\*/g) || []).length;

  // 如果恰好有四个星号，则删除所有星号
  if (asteriskCount === 4) {
    return inputString.replace(/\*/g, "");
  }

  // 否则返回原字符串
  return inputString;
}

/**
 * 如果字符串首尾有一对相同的标点符号，则将其删除。
 * @param {string} str 输入的字符串。
 * @returns {string} 处理后的字符串。
 */
export function removeSurroundingPunctuation(str) {
  str = str.trim();
  // 1. 定义一个标点符号的集合。你可以根据需要添加或删除任何标点。
  // 这里包含了常见的英文和中文标点符号。
  const punctuation = `'"` + "`" + `()[]{}<>.,;:!?~·—…“”‘’`;

  // 2. 处理边界情况：如果输入不是字符串，或者字符串长度小于2，则不可能有匹配的符号对。
  if (typeof str !== "string" || str.length < 2) {
    return str;
  }

  // 3. 获取首尾字符。
  const firstChar = str[0];
  const lastChar = str[str.length - 1];

  // 4. 检查：
  //    a) 首尾字符是否相同。
  //    b) 该字符是否存在于我们的标点符号集合中。
  if (firstChar === lastChar && punctuation.includes(firstChar)) {
    // 5. 如果条件满足，使用 slice(1, -1) 删除首尾字符。
    return str.slice(1, -1);
  }

  // 6. 如果条件不满足，返回原始字符串。
  // 如果字符串中有四个*号, 那么就全部删除*号
  if (str.length >= 4 && str.startsWith("*") && str.endsWith("*")) {
    return str.slice(1, -1);
  }
  const result = removeAsterisksIfExactlyFour(str);
  return result;
}

/**
 * 移除HTML字符串中标签之间的多余空白字符，以适配微信公众号等环境。
 * @param {string} htmlString - 包含待清理空白的HTML字符串。
 * @returns {string} - 清理掉标签间空白后的HTML字符串。
 */
export function removeWhitespaceBetweenTags(htmlString) {
  if (!htmlString || typeof htmlString !== "string") {
    return "";
  }

  const cleanedString = htmlString
    // 核心步骤：使用正则表达式匹配 ">" 和 "<" 之间的所有空白字符(\s+)，
    // 并将它们替换为空字符串，实现标签的紧密贴合。
    // g 标志确保替换所有匹配项，而不仅仅是第一个。
    .replace(/>\s+</g, "><")

    // 移除整个字符串开头和结尾可能存在的空白。
    .trim();

  return cleanedString;
}

/**
 * 修复列表项中包含额外文本的问题
 * @param {string} markdownText 原始的Markdown文本
 * @returns {string} 修复后的Markdown文本
 */
export function fixListItemsWithExtraText(markdownText) {
  const lines = markdownText.split(/\r?\n/);
  const fixedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检查是否是列表项的开始
    if (/^\s*[-*+]\s+/.test(line)) {
      // 检查下一个非空行是否不是列表项
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") {
        j++;
      }

      // 如果下一个非空行不是列表项，则在当前列表项后添加一个空行
      if (
        j < lines.length &&
        !/^\s*[-*+]\s+/.test(lines[j]) &&
        !/^\s*\d+\.\s+/.test(lines[j]) &&
        lines[j].trim() !== ""
      ) {
        fixedLines.push(line);
        // 检查下一行是否已经是空行，避免重复添加
        if (i + 1 < lines.length && lines[i + 1].trim() === "") {
          // 下一行已经是空行，不需要再添加空行
        } else {
          fixedLines.push(""); // 添加空行分隔
        }
        continue;
      }
    }

    fixedLines.push(line);
  }
  const result = fixedLines.join("\n");
  return result;
}

export function trimOuterPTags(html) {
  // 移除列表项内容外层的 <p> 标签
  // 支持 <p>文本</p> 以及 <p>文本</p>\n<嵌套列表> 两种情况
  return html.replace(/^<p[^>]*>([\s\S]*?)<\/p[^>]*>([\s\S]*)$/i, "$1$2").trim();
}

export async function getAccessToken(CONFIG) {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${CONFIG.APP_ID}&secret=${CONFIG.APP_SECRET}`;
  const response = await fetch(url, {
    headers: { Connection: "close" },
  });
  if (!response.ok) {
    await response.text();
    throw new Error(`API 请求失败，状态码: ${response.status}`);
  }
  const data = await response.json();
  if (data.access_token) {
    const tokenInfo = {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      fetchTime: Date.now(),
    };
    await writeFile(
      CONFIG.TOKEN_FILE_PATH,
      JSON.stringify(tokenInfo, null, 2),
      "utf8",
    );
    return data.access_token;
  } else {
    throw new Error(`获取 Access Token 失败: ${JSON.stringify(data)}`);
  }
}

export async function checkAndRefreshToken(CONFIG) {
  try {
    await access(CONFIG.TOKEN_FILE_PATH);
    const tokenData = await readFile(CONFIG.TOKEN_FILE_PATH, "utf8");
    const { accessToken, expiresIn, fetchTime } = JSON.parse(tokenData);
    if (Date.now() - fetchTime < (expiresIn - 600) * 1000) {
      return accessToken;
    } else {
      return await getAccessToken(CONFIG);
    }
  } catch (error) {
    return await getAccessToken(CONFIG);
  }
}
export async function uploadFile(url, filePath) {
  await access(filePath);
  const fileBuffer = await readFile(filePath);
  const fileBlob = new Blob([fileBuffer]);
  const formData = new FormData();
  formData.append("media", fileBlob, path.basename(filePath));
  const response = await fetch(url, {
    method: "POST",
    headers: { Connection: "close" }, // 禁用 keep-alive
    body: formData,
  });
  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(`文件上传 API 请求失败: ${JSON.stringify(errorBody)}`);
  }
  return await response.json();
}

export async function uploadContentImage(imagePath, accessToken, CONFIG) {
  const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`;

  try {
    const data = await uploadFile(url, imagePath);
    if (data && data.url) {
      return data.url;
    } else {
      throw new Error(`上传正文图片后未收到有效 URL: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    // 检查是否是token失效错误
    if (
      error instanceof Error &&
      (error.message.includes("invalid credential") ||
        error.message.includes("access_token is invalid"))
    ) {
      // 重新获取token并重试
      const newAccessToken = await getAccessToken(CONFIG);
      const retryUrl = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${newAccessToken}`;
      const retryData = await uploadFile(retryUrl, imagePath);
      if (retryData && retryData.url) {
        return retryData.url;
      } else {
        throw new Error(
          `重试上传正文图片后仍未收到有效 URL: ${JSON.stringify(retryData)}`,
        );
      }
    } else {
      // 其他错误直接抛出
      throw error;
    }
  }
}

export async function uploadCoverImage(imagePath, accessToken, CONFIG) {
  // return "mVlTzdG84QF_OwEOKtacosDMHAZftxreiTz6li3NED7f2nT45TviHn5wnhvXscUx";
  const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`;

  try {
    const data = await uploadFile(url, imagePath);
    if (data && data.media_id) {
      return data.media_id;
    } else {
      throw new Error(
        `上传封面图后未收到有效 media_id: ${JSON.stringify(data)}`,
      );
    }
  } catch (error) {
    // 检查是否是token失效错误
    if (
      error instanceof Error &&
      (error.message.includes("invalid credential") ||
        error.message.includes("access_token is invalid") ||
        error.message.includes("40001"))
    ) {
      // 重新获取token并重试
      const newAccessToken = await getAccessToken(CONFIG);
      const retryUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${newAccessToken}&type=image`;
      const retryData = await uploadFile(retryUrl, imagePath);
      if (retryData && retryData.media_id) {
        return retryData.media_id;
      } else {
        throw new Error(
          `重试后上传封面图仍未收到有效 media_id: ${JSON.stringify(retryData)}`,
        );
      }
    }
    throw error;
  }
}

/**
 * 移除紧挨着的 ul 和 li 标签之间的换行和空格 (修正版)
 * @param {string} htmlString - 包含 HTML 的字符串
 * @returns {string} - 处理后的 HTML 字符串
 */
export function removeWhitespaceBetweenUlAndLi(htmlString) {
  // 修正：移除了不属于 CheerioOptions 顶层接口的参数
  // 对于此任务，默认配置即可工作
  const $ = load(htmlString);

  $("ul").each((i, ulElement) => {
    const $ul = $(ulElement);
    const contents = $ul.contents();

    contents.each((j, content) => {
      // 检查节点类型是否为文本节点 (nodeType === 3)
      // 并且检查文本内容是否只包含空白字符
      if (content.type === "text" && /^\s*$/.test(content.data)) {
        const prev = contents.get(j - 1);
        const next = contents.get(j + 1);

        // 检查 prev 和 next 是否存在并且有 tagName 属性
        const prevTagName = prev && prev.type === "tag" ? prev.name : null;
        const nextTagName = next && next.type === "tag" ? next.name : null;

        if (
          (prev && prevTagName === "li") ||
          (next && nextTagName === "li") ||
          (!prev && next && nextTagName === "li") ||
          (prev && prevTagName === "li" && !next)
        ) {
          $(content).remove();
        }
      }
    });
  });

  // 为了避免输出 `<html><body>...</body></html>` 的完整结构，
  // 我们可以选择 ul 元素自身并获取其 HTML 内容
  const bodyHtml = $("body").html();
  return bodyHtml || "";
}
