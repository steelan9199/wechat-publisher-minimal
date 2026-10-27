// 导入主题配置
import { BASE_CONFIG, BLUE_THEME, BLUE_THEME_SETTINGS } from "./theme.js";
import {
  trimOuterPTags,
  removeWhitespaceBetweenTags,
  removeSurroundingPunctuation,
} from "./service.js";

// 斜体渲染器 (*斜体* 或 _斜体_)
export function getEmRenderer(theme) {
  return {
    renderer: {
      em({ tokens }) {
        // 解析斜体内容
        const content = this.parser.parseInline(tokens);

        // 斜体样式 - 使用 span 标签 + font-style: italic
        // 微信编辑器对 <i> 和 <em> 标签的斜体支持有问题，必须使用内联样式
        const result = `<span style="font-style: italic;">${content}</span>`;
        return result;
      },
    },
  };
}

// 关键词强调渲染器 (**关键词**)
export function getStrongRenderer(theme) {
  return {
    renderer: {
      strong({ tokens }) {
        // 解析强调内容
        const content = this.parser.parseInline(tokens);

        // 强调样式 (使用品牌色)
        const accentColor = BLUE_THEME.accent;
        const result = `<strong style="color: ${accentColor}; font-weight: 700;">${content}</strong>`;
        return result;
      },
    },
  };
}

// 标题渲染器
export function getHeadingRenderer(theme) {
  return {
    renderer: {
      heading(token) {
        const text = token.text.trim();
        const level = token.depth;
        const cleanText = removeSurroundingPunctuation(text);
        const effectiveLevel = [1, 2].includes(level) ? 2 : 3;
        let fontSize, textColor;

        // 获取装饰配置
        const decorations = BLUE_THEME.decorations;
        let prefix = "";
        let suffix = "";

        if (decorations) {
          if (effectiveLevel === 2) {
            prefix = decorations.h2Prefix || "";
            suffix = decorations.h2Suffix || "";
          } else {
            prefix = decorations.h3Prefix || "";
            suffix = decorations.h3Suffix || "";
          }
        }

        switch (effectiveLevel) {
          case 2:
            fontSize = BLUE_THEME_SETTINGS.h2.size;
            textColor = BLUE_THEME.primary; // 使用主题主色
            break;
          case 3:
            fontSize = BLUE_THEME_SETTINGS.h3.size;
            textColor = BLUE_THEME.secondary; // 使用主题次色
            break;
        }

        // 简化的标题样式
        const headingStyle = `
          display: block;
          margin: 20px 0 16px 0;
          font-family: ${BASE_CONFIG.fontFamily};
          font-size: ${fontSize};
          font-weight: 700;
          color: ${textColor};
          text-align: center;
          line-height: 1.4;
        `.trim();

        // 装饰线条样式
        const lineStyle = `
          display: block;
          width: 60px;
          height: 3px;
          background-color: ${textColor};
          margin: 8px auto 0 auto;
          border-radius: 2px;
        `.trim();

        // 标题HTML结构，装饰线条在文字下方
        const displayText = `${prefix}${cleanText}${suffix}`;
        const result =
          `<h${effectiveLevel} style="${headingStyle}">${displayText}<span style="${lineStyle}"></span></h${effectiveLevel}>`.trim();

        // 在返回之前，调用清理函数
        return removeWhitespaceBetweenTags(result);
      },
    },
  };
}

// 列表项渲染器
export function getListitemRenderer(themeColors) {
  // 获取装饰配置，如果有则使用自定义符号，否则使用默认圆点
  const decorations = BLUE_THEME.decorations;
  const listBullet = decorations?.listSymbol || "•"; // 使用自定义符号或默认小圆点
  const listColor = BLUE_THEME.listColor; // 使用主题颜色

  // 任务列表复选框样式
  const checkboxBaseStyle = `
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    margin-right: 8px;
    vertical-align: middle;
    text-align: center;
    line-height: 16px;
    font-size: 12px;
  `
    .trim()
    .replace(/\s+/g, " ");

  // 未选中的复选框样式
  const uncheckedStyle = `${checkboxBaseStyle} border: 2px solid ${BLUE_THEME.primary}; background-color: #fff;`;

  // 已选中的复选框样式
  const checkedStyle = `${checkboxBaseStyle} border: 2px solid ${BLUE_THEME.primary}; background-color: ${BLUE_THEME.primary}; color: #fff;`;

  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.ListItem 对象
       * @param {boolean} isOrdered - 是否是有序列表项（由 list 渲染器传入）
       */
      listitem: function (token, isOrdered = false) {
        // 必须使用 'function' 关键字才能访问 this

        // 解析列表项内容，使用parse来正确处理块级元素
        const content = this.parser.parse(token.tokens);

        // 移除最外层的<p>标签
        const cleanContent = trimOuterPTags(content.trim());

        // 检查是否是任务列表项（GFM task list）
        if (token.task) {
          // 生成复选框HTML
          const checkbox = token.checked
            ? `<span style="${checkedStyle}">✓</span>`
            : `<span style="${uncheckedStyle}">&nbsp;</span>`;

          // 已完成任务的文字样式（添加删除线和灰色）
          const textStyle = token.checked
            ? `color: #999; text-decoration: line-through;`
            : `color: ${BASE_CONFIG.defaultTextColor};`;

          const result = `<li style="list-style-type: none; margin-left: -10px;">${checkbox}<span style="${textStyle}">${cleanContent}</span></li>`;
          return result;
        }

        // 检查是否包含嵌套列表
        const hasNestedList = /<(ul|ol)[^>]*>/.test(cleanContent);

        // 检测是否包含图片标签（微信公众号对 span 中的 img 标签解析有问题，需要特殊处理）
        const hasImage = /<img\s[^>]*>/i.test(cleanContent);

        // 根据列表类型使用不同的样式
        if (isOrdered) {
          // 有序列表项 - 数字使用主题色，文字使用默认颜色
          if (hasNestedList) {
            // 包含嵌套列表时，将文本和子列表分开处理
            // 由于子列表已被移到 li 外，同一层级可能出现多个 ul/ol，
            // 因此不能简单用正则匹配，而是从第一个 <ul>/<ol> 开始截取到末尾
            const nestedListStart = cleanContent.search(/<(ul|ol)\b/);
            const textContent =
              nestedListStart >= 0
                ? cleanContent.slice(0, nestedListStart).trim()
                : cleanContent;
            const nestedListHtml =
              nestedListStart >= 0 ? cleanContent.slice(nestedListStart) : "";
            // 子列表作为 li 的兄弟节点，以兼容微信公众号编辑器
            const result = `<li style="color: ${listColor};"><span style="color: ${BASE_CONFIG.defaultTextColor};">${textContent}</span></li>${nestedListHtml}`;
            return result;
          } else if (hasImage) {
            // 包含图片时，用微信公众号编辑器期望的 section 结构包裹图片
            const textPart = cleanContent.replace(/<img\s[^>]*>/gi, "");
            const imageMatches = cleanContent.match(/<img\s[^>]*>/gi) || [];
            const imagePart = imageMatches
              .map(
                (img) =>
                  `<section style="text-align: center" nodeleaf="">${img}</section>`,
              )
              .join("");
            if (textPart.trim()) {
              const result = `<li style="color: ${listColor};"><section style="font-size: 15px; line-height: 1.75; color: #595959;"><p><span style="color: ${BASE_CONFIG.defaultTextColor};">${textPart}</span></p>${imagePart}</section></li>`;
              return result;
            } else {
              const result = `<li style="color: ${listColor};"><section style="font-size: 15px; line-height: 1.75; color: #595959;">${imagePart}</section></li>`;
              return result;
            }
          } else {
            const result = `<li style="color: ${listColor};"><span style="color: ${BASE_CONFIG.defaultTextColor};">${cleanContent}</span></li>`;
            return result;
          }
        } else {
          // 无序列表项 - 使用圆点样式，点的颜色使用主题色
          if (hasNestedList) {
            // 包含嵌套列表时，将文本和子列表分开处理
            // 由于子列表已被移到 li 外，同一层级可能出现多个 ul/ol，
            // 因此不能简单用正则匹配，而是从第一个 <ul>/<ol> 开始截取到末尾
            const nestedListStart = cleanContent.search(/<(ul|ol)\b/);
            const textContent =
              nestedListStart >= 0
                ? cleanContent.slice(0, nestedListStart).trim()
                : cleanContent;
            const nestedListHtml =
              nestedListStart >= 0 ? cleanContent.slice(nestedListStart) : "";
            // 子列表作为 li 的兄弟节点，以兼容微信公众号编辑器
            const result = `<li style="color: ${listColor}; list-style-type: '${listBullet} ';"><span style="color: ${BASE_CONFIG.defaultTextColor};">${textContent}</span></li>${nestedListHtml}`;
            return result;
          } else if (hasImage) {
            // 包含图片时，用微信公众号编辑器期望的 section 结构包裹图片
            const textPart = cleanContent.replace(/<img\s[^>]*>/gi, "");
            const imageMatches = cleanContent.match(/<img\s[^>]*>/gi) || [];
            const imagePart = imageMatches
              .map(
                (img) =>
                  `<section style="text-align: center" nodeleaf="">${img}</section>`,
              )
              .join("");
            if (textPart.trim()) {
              const result = `<li style="color: ${listColor}; list-style-type: '${listBullet} ';"><section style="font-size: 15px; line-height: 1.75; color: #595959;"><p><span style="color: ${BASE_CONFIG.defaultTextColor};">${textPart}</span></p>${imagePart}</section></li>`;
              return result;
            } else {
              const result = `<li style="color: ${listColor}; list-style-type: '${listBullet} ';"><section style="font-size: 15px; line-height: 1.75; color: #595959;">${imagePart}</section></li>`;
              return result;
            }
          } else {
            const result = `<li style="color: ${listColor}; list-style-type: '${listBullet} ';"><span style="color: ${BASE_CONFIG.defaultTextColor};">${cleanContent}</span></li>`;
            return result;
          }
        }
      },

      list: function (token) {
        // 获取列表类型 (ordered 或 unordered)
        const type = token.ordered ? "ol" : "ul";
        const isOrdered = token.ordered;

        // 解析所有列表项
        let body = "";
        for (const item of token.items) {
          // 直接调用 listitem 渲染器处理列表项，传入是否有序的标志
          body += this.listitem(item, isOrdered);
        }

        // 移除列表项之间的空白字符，避免微信编辑器中出现小黑点
        const cleanBody = body.replace(/>\s+</g, "><");
        // 有序列表添加 padding-left，确保两位数序号(10, 11...)不被截断
        // 微信编辑器的 list-paddingleft-1 类的 padding-left 不足以显示两位数序号
        const listStyle = isOrdered ? ' style="padding-left: 30px;"' : "";
        const result = `<${type}${listStyle}>${cleanBody}</${type}>`;
        return result;
      },
    },
  };
}

// 代码渲染器
export function getCodeRenderer(selectedTheme, THEME_NAME) {
  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Code 对象
       */
      code(token) {
        // {
        //   type: 'code',
        //   raw: '```\nthis is code\n```',
        //   lang: '',
        //   text: 'this is code'
        // }

        // 如果没有语言标识，则返回普通行内代码
        if (!token.lang) {
          token.lang = "text";
        }

        // 处理代码块
        const language = token.lang;
        const codeContent = token.text;

        // 按行分割并去除首尾空行
        const lines = codeContent.split(/\r?\n/);
        let startIndex = 0;
        let endIndex = lines.length - 1;

        // 找到第一个非空行
        while (startIndex < lines.length && lines[startIndex].trim() === "") {
          startIndex++;
        }

        // 找到最后一个非空行
        while (endIndex >= 0 && lines[endIndex].trim() === "") {
          endIndex--;
        }

        // 提取有效行
        const trimmedLines = lines.slice(startIndex, endIndex + 1);

        // 使用优化后的统一主题系统生成代码块（代码块样式跟随主题配置）
        const result = generateWechatCodeBlock(language, trimmedLines);
        return result;
      },

      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Codespan 对象
       */
      codespan(token) {
        // 处理行内代码（`code` 格式的）
        const escaped = token.text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
        const result = `<code style="background-color: ${BLUE_THEME.codeBg}; color: ${BLUE_THEME.codeText}; padding: 2px 4px; border-radius: 3px; font-family: Consolas, Monaco, 'Lucida Console', monospace, ${BASE_CONFIG.fontFamily};">${escaped}</code>`;
        return result;
      },
    },
  };
}

// 图片渲染器
export function getImageRenderer(theme) {
  return {
    renderer: {
      image({ href, title, text }) {
        let out = '<img src="' + href + '" alt="' + text + '"';
        if (title) {
          out += ' title="' + title + '"';
        }
        out += ' style="padding: 8px;"';
        out += ">";
        return out;
      },
    },
  };
}

// 引用块渲染器
export function getBlockquoteRenderer(theme) {
  /**
   * 辅助函数，用于处理段落内容中的换行符。
   * 它会查找所有 <p> 标签，并将内部的换行符 \n 转换成 <br> 标签，
   * 这样浏览器才能正确地渲染换行。
   * @param {string} content - 包含 <p> 标签的 HTML 字符串。
   * @returns {string} - 处理换行符后的 HTML 字符串。
   */
  const processParagraphsWithLineBreaks = (content) => {
    // 使用正则表达式查找所有的 <p>...</p> 段落
    return content.replace(
      /<p([^>]*)>([\s\S]*?)<\/p>/g,
      (pMatch, pAttributes, pContent) => {
        // 将换行符转换为 <br> 标签
        const processedLines = pContent.split(/\r?\n/).join("<br>");
        // 重新构建 <p> 标签并返回
        return `<p${pAttributes}>${processedLines}</p>`;
      },
    );
  };

  return {
    renderer: {
      blockquote(token) {
        // 1. 解析原始的 blockquote 内容，得到 HTML 字符串
        const body = this.parser.parse(token.tokens);
        // 2. 检查内容是否是 Callout 标识（如 [!NOTE]）
        const alertMatch = body.match(
          /^<p>(?:<span\b[^>]*>)?\[!([^\]\r\n]+)\]/i,
        );

        // 3. 如果是特殊告警类型
        if (alertMatch) {
          const alertType = alertMatch[1].toLowerCase();
          // 从内容中移除 Callout 标记
          let processedContent = body.replace(
            /^<p>(?:<span\b[^>]*>)?\[![^\]\r\n]+\](?:\r?\n|<br\s*\/?>)?/i,
            "<p>",
          );
          // 标识所在的 span 只负责包装文本，移除标识后同步移除其结束标签
          processedContent = processedContent.replace(
            /<\/span>(\s*<\/p>)/i,
            "$1",
          );

          // 处理内容中的换行符
          processedContent = processParagraphsWithLineBreaks(processedContent);

          // 设置告警样式颜色（使用蓝色主题配置）
          let barColor = ""; // 左侧竖条颜色
          let bgColor = ""; // 背景颜色

          switch (alertType) {
            case "note":
            case "thinking_face":
            case "question":
            case "speech_balloon":
            case "memo":
            case "calendar":
            case "bookmark":
              barColor = BLUE_THEME.blockquoteAlert.note.barColor;
              bgColor = BLUE_THEME.blockquoteAlert.note.bgColor;
              break;
            case "tip":
            case "bulb":
            case "white_check_mark":
            case "+1":
            case "fire":
            case "100":
              barColor = BLUE_THEME.blockquoteAlert.tip.barColor;
              bgColor = BLUE_THEME.blockquoteAlert.tip.bgColor;
              break;
            case "important":
            case "exclamation":
              barColor = BLUE_THEME.blockquoteAlert.important.barColor;
              bgColor = BLUE_THEME.blockquoteAlert.important.bgColor;
              break;
            case "warning":
            case "warn":
            case "clock":
              barColor = BLUE_THEME.blockquoteAlert.warning.barColor;
              bgColor = BLUE_THEME.blockquoteAlert.warning.bgColor;
              break;
            case "caution":
            case "x":
              barColor = BLUE_THEME.blockquoteAlert.caution.barColor;
              bgColor = BLUE_THEME.blockquoteAlert.caution.bgColor;
              break;
            default:
              barColor = BLUE_THEME.blockquoteAlert.note.barColor;
              bgColor = BLUE_THEME.blockquoteAlert.note.bgColor;
              break;
          }

          // 使用表格和背景渐变来创建带左侧色条的样式（表格圆角会裁剪渐变）
          const result = `<table style="width: 100%; background-image: linear-gradient(to right, ${barColor} 0px, ${barColor} 4px, ${bgColor} 4px, ${bgColor} 100%); border-collapse: collapse; border-radius: 6px; overflow: hidden;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 12px 12px 12px 16px;">
                ${processedContent}
              </td>
            </tr>
          </table>`;
          return result;
        }

        // 4. 如果是普通引用块
        // 处理段落内的换行问题
        const processedParagraphs = processParagraphsWithLineBreaks(body);

        // 使用蓝色主题配置的颜色
        const normalBarColor = BLUE_THEME.blockquoteNormal.barColor;
        const normalBgColor = BLUE_THEME.blockquoteNormal.bgColor;

        const result = `<table style="width: 100%; background-image: linear-gradient(to right, ${normalBarColor} 0px, ${normalBarColor} 4px, ${normalBgColor} 4px, ${normalBgColor} 100%); border-collapse: collapse; border-radius: 6px; overflow: hidden;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 12px 12px 12px 16px;">
              ${processedParagraphs}
            </td>
          </tr>
        </table>`;
        return result;
      },
    },
  };
}

// 空格渲染器
export function getSpaceRenderer() {
  return {
    renderer: {
      space(token) {
        // 处理空格元素，保留原始空格和换行数量
        if (token.type === "space" && token.raw) {
          // 统一处理所有类型的换行符
          if (/[\r\n]/.test(token.raw)) {
            // 检查是否整个字符串都由换行符组成
            const isNewlinesOnly = /^[\r\n]+$/.test(token.raw);
            // 获取所有换行符序列
            const newlineSequences = token.raw.match(/\r\n|\n|\r/g);

            // 如果纯换行符且至少有两个换行符序列
            if (
              isNewlinesOnly &&
              newlineSequences &&
              newlineSequences.length >= 2
            ) {
              // 减少一个<br>以符合用户直觉
              const brCount = newlineSequences.length - 1;
              return "<br>".repeat(brCount);
            }

            // 其他情况，保持原始换行数量
            const result = token.raw.replace(/\r\n|\n|\r/g, "<br>");
            return result;
          }

          // 处理普通空格，保留原始空格数量
          if (token.raw.includes(" ")) {
            const result = token.raw.replace(/ /g, "&nbsp;");
            return result;
          }
        }
        // 处理其他可能的空格类型
        const result = "";
        return result;
      },
    },
  };
}

// 水平线渲染器
export function getHrRenderer(theme) {
  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Hr 对象
       */
      hr(token) {
        const primaryColor = BLUE_THEME.primary;
        const decorations = BLUE_THEME.decorations;

        // 如果有自定义分隔符，使用文字装饰风格
        if (decorations?.hrSymbol) {
          const result =
            `<section style="display: flex; justify-content: center; align-items: center; width: 100%; height: 20px; margin: 0 0;">
  <span style="color: ${primaryColor}; font-size: 14px; letter-spacing: 0px;">${decorations.hrSymbol}</span>
</section>`.trim();
          return result;
        }

        // 默认的三个圆点样式
        const result =
          `<section style="display: flex; justify-content: center; align-items: center; width: 100%; height: 20px; margin: 0 0;">
  <!-- 第一个圆点 -->
  <span style="width: 6px; height: 6px; border-radius: 50%; background-color: #cccccc;"></span>

  <!-- 第二个圆点 -->
  <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${primaryColor}; margin-left: 10px;"></span>

  <!-- 第三个圆点 -->
  <span style="width: 6px; height: 6px; border-radius: 50%; background-color: #cccccc; margin-left: 10px;"></span>
</section>`.trim();
        return result;
      },
    },
  };
}

// 换行符渲染器
export function getBrRenderer() {
  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Br 对象
       */
      br(token) {
        // 创建换行符，使用微信编辑器兼容的样式
        return "<br>";
      },
    },
  };
}

// 删除线渲染器
export function getDelRenderer(theme) {
  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Del 对象
       */
      del({ tokens }) {
        // 解析删除线内容
        const content = this.parser.parseInline(tokens);

        // 创建删除线，使用微信编辑器兼容的样式 (使用蓝色主题配置)
        return `<span style="text-decoration: line-through; color: #999;">${content}</span>`;
      },
    },
  };
}

// 链接渲染器
export function getLinkRenderer(theme) {
  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Link 对象
       */
      link({ href, title, tokens }) {
        // 解析链接文本
        const text = this.parser.parseInline(tokens);

        // 创建链接，使用微信编辑器兼容的样式 (使用蓝色主题配置)
        return `<a href="${href}" title="${title || ""}" style="color: ${BLUE_THEME.accent}; text-decoration: underline;">${text}</a>`;
      },
    },
  };
}

// 文本渲染器
export function getTextRenderer(theme) {
  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Text 或 Tokens.Escape 对象
       */
      text(token) {
        // 如果token包含子tokens，使用parseInline来处理它们
        // 这种情况通常出现在列表项等包含行内元素的内容中
        if (token.tokens && token.tokens.length > 0) {
          // 使用parseInline处理子tokens，这会正确调用codespan renderer等
          const content = this.parser.parseInline(token.tokens);
          return content;
        }

        // 获取原始文本内容
        const content = token.text;

        // 如果内容为空，直接返回 false
        if (!content) {
          return false;
        }

        // 检查是否是由marked处理后产生的HTML内容（以避免重复处理）
        // 检查是否以典型的HTML标签开头和结尾
        const isProcessedHtml =
          /^<[^>]+>.*<\/[^>]+>$/.test(content.trim()) ||
          /^<[^>]+\/?>$/.test(content.trim());

        if (isProcessedHtml) {
          return content;
        }

        const alertMatch = content.match(/^\[![^\]\r\n]+\]/i);

        // 3. 如果是特殊告警类型
        if (alertMatch) {
          return false;
        }

        // 处理箭头流程文本
        // 检查是否包含箭头符号
        if (content.includes("->")) {
          // 匹配连续的箭头流程，例如: 第一步->第二步->第三步->第四步
          // 使用更准确的正则表达式来匹配整个箭头流程
          const arrowFlowRegex = /([^->\n]+?->[^->\n]+(?:->[^->\n]+)*)/g;
          let processedContent = content.replace(arrowFlowRegex, (match) => {
            // 将连续的箭头流程分解为单独的箭头对
            const parts = match.split("->").map((part) => part.trim());
            let result = "";

            // 正确处理连续的箭头流程
            for (let i = 0; i < parts.length - 1; i++) {
              if (i > 0) {
                // 添加箭头和右边的元素
                const rightSpan = `<span style="background-color: ${BLUE_THEME.markBg}; color: ${BLUE_THEME.markText}; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${parts[i + 1]}</span>`;
                result += ` -> ${rightSpan}`;
              } else {
                // 添加左边和右边的元素
                const leftSpan = `<span style="background-color: ${BLUE_THEME.markBg}; color: ${BLUE_THEME.markText}; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${parts[i]}</span>`;
                const rightSpan = `<span style="background-color: ${BLUE_THEME.markBg}; color: ${BLUE_THEME.markText}; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${parts[i + 1]}</span>`;
                result += `${leftSpan} -> ${rightSpan}`;
              }
            }

            return result;
          });

          // 处理换行符
          processedContent = processedContent.replace(/\r\n|\n|\r/g, "<br>");

          // 应用主题中的默认文本样式，包括字体族
          const textStyle = ``;

          // 对于普通文本，应用默认样式
          if (processedContent.trim() !== "") {
            const result = `<span style="${textStyle}">${processedContent}</span>`;
            return result;
          }
        }

        // 检测文本中的链接并替换为蓝色加粗样式
        // 但如果内容包含 img 标签或 code 标签，则跳过 URL 检测，避免破坏图片标签和行内代码
        let processedContent = content;
        if (!content.includes("<img") && !content.includes("<code")) {
          const urlPattern =
            /(https?:\/\/)(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{2,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
          processedContent = content.replace(urlPattern, (match) => {
            return `<span style="color: ${BLUE_THEME.primary}; font-weight: bold;">${match}</span>`;
          });
        }

        // 处理换行符
        processedContent = processedContent.replace(/\r\n|\n|\r/g, "<br>");

        // 应用主题中的默认文本样式，包括字体族
        // const textStyle = `font-size: ${BASE_CONFIG.sizes.content}; color: ${BASE_CONFIG.defaultTextColor}; font-family: ${BASE_CONFIG.fontFamily};`;
        const textStyle = ``;

        // 对于普通文本，应用默认样式
        if (processedContent.trim() !== "") {
          const result = `<span style="${textStyle}">${processedContent}</span>`;
          return result;
        }
      },
    },
  };
}

// 表格渲染器
export function getTableRenderer(theme) {
  return {
    renderer: {
      /**
       * @param {object} token - 这是新版 marked 传递的 Tokens.Table 对象
       */
      table(token) {
        // 解析表头
        const header = token.header.map((cell) =>
          this.parser.parseInline(cell.tokens),
        );

        // 解析表行
        const rows = token.rows.map((row) => {
          return row.map((cell) => this.parser.parseInline(cell.tokens));
        });

        // 表格样式
        const tableStyle = `
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-family: ${BASE_CONFIG.fontFamily};
          font-size: ${BASE_CONFIG.sizes.content};
        `.trim();

        // 表头单元格样式
        const thStyle = `
          background-color: #f5f5f5;
          border: 1px solid #ddd;
          padding: 12px 15px;
          text-align: left;
          font-weight: bold;
        `.trim();

        // 普通单元格样式
        const tdStyle = `
          border: 1px solid #ddd;
          padding: 12px 15px;
          text-align: left;
        `.trim();

        // 构建表头HTML
        let headerHtml = "<tr>";
        header.forEach((cell, index) => {
          const align = token.align[index];
          let alignStyle = "";
          if (align === "center") alignStyle = "text-align: center;";
          else if (align === "right") alignStyle = "text-align: right;";

          headerHtml += `<th style="${thStyle} ${alignStyle}">${cell}</th>`;
        });
        headerHtml += "</tr>";

        // 构建表格行HTML
        let rowsHtml = "";
        rows.forEach((row) => {
          rowsHtml += "<tr>";
          row.forEach((cell, index) => {
            const align = token.align[index];
            let alignStyle = "";
            if (align === "center") alignStyle = "text-align: center;";
            else if (align === "right") alignStyle = "text-align: right;";

            rowsHtml += `<td style="${tdStyle} ${alignStyle}">${cell}</td>`;
          });
          rowsHtml += "</tr>";
        });

        // 组装完整表格
        const result = `
          <table style="${tableStyle}">
            <thead>${headerHtml}</thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `.trim();

        return result;
      },
    },
  };
}

// ===== 微信公众号代码块生成器 =====
/**
 * 生成符合微信公众号规范的代码块HTML
 *
 * 该函数生成完全兼容微信公众号编辑器的代码块HTML结构，
 * 包含苹果风格的装饰头部和语法高亮支持。
 *
 * @param {string} language - 编程语言标识符
 * @param {string[]} codeLines - 代码行数组
 * @returns {string} 完整的HTML代码块字符串
 * @throws {Error} 当主题不存在时抛出错误
 */
function generateWechatCodeBlock(language, codeLines) {
  // 参数验证
  if (!language || !codeLines || !Array.isArray(codeLines)) {
    throw new Error("generateWechatCodeBlock: 参数不完整或格式错误");
  }

  // 蓝色主题样式配置
  const themeStyle = {
    content: {
      color: BLUE_THEME.codeBlock.contentText,
      background: BLUE_THEME.codeBlock.contentBg,
    },
    outerContainer: {
      background: BLUE_THEME.codeBlock.outerBg,
      border: `1px solid ${BLUE_THEME.codeBlock.border}`,
      "border-radius": BLUE_THEME_SETTINGS.codeBlockRadius,
    },
    header: {
      background: BLUE_THEME.codeBlock.headerBg,
      color: BLUE_THEME.codeBlock.headerText,
    },
    dots: BLUE_THEME.codeBlock.dots,
  };

  /**
   * 编程语言映射表
   * 将常见的语言标识符映射为标准化名称
   */
  const LANGUAGE_MAP = {
    // JavaScript相关
    js: "javascript",
    javascript: "javascript",
    jsx: "javascript",

    // TypeScript相关
    typescript: "typescript",
    ts: "typescript",
    tsx: "typescript",

    // 数据格式
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "html",

    // 系统语言
    python: "python",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "cpp",
    "c++": "cpp",

    // Web技术
    html: "html",
    css: "css",
    scss: "css",
    sass: "css",

    // 其他
    shell: "bash",
    bash: "bash",
    sql: "sql",
    php: "php",
    go: "go",
    rust: "rust",
    ruby: "ruby",
  };

  const mappedLang = LANGUAGE_MAP[language.toLowerCase()] || "text";

  /**
   * 生成微信公众号专用的代码块样式
   * 严格按照微信公众号编辑器要求的CSS格式
   */
  const generateWechatStyles = (themeStyle) => ({
    // 外层容器样式 - 必须包含完整的微信兼容属性
    outerContainer: [
      "white-space: pre-wrap",
      "overflow-x: auto",
      `color: ${themeStyle.content.color}`,
      `background: ${themeStyle.outerContainer.background}`,
      "text-shadow: none",
      "line-height: 1.5",
      "letter-spacing: .2px",
      "word-spacing: normal",
      "word-break: normal",
      "word-wrap: normal",
      "text-align: left",
      `border: ${themeStyle.outerContainer.border}`,
      `border-radius: ${themeStyle.outerContainer["border-radius"]}`,
      "margin: 1em 0",
      "padding: 0",
    ].join("; "),

    // 苹果风格头部样式
    header: [
      "display: flex",
      "justify-content: space-between",
      "align-items: center",
      "font-size: 12px",
      "height: 30px",
      "line-height: 30px",
      `background: ${themeStyle.header.background}`,
    ].join("; "),

    // 工具栏样式
    toolsLeft:
      "display: flex; align-items: center; padding: 9px 12px; width: 75px;",
    toolsRight:
      "width: 80px;display: flex; align-items: center;justify-content: center;",

    // 圆点样式生成函数
    getCircleStyle: (color) => {
      // 如果颜色是 undefined，使用默认的苹果风格颜色
      const safeColor = color || "#ff5f57"; // 默认使用红色
      return [
        "display: inline-block",
        "width: 12px",
        "height: 12px",
        "line-height: 12px",
        "font-size: 12px",
        "text-align: center",
        `color: ${safeColor}`,
      ].join("; ");
    },

    // 内容区域样式
    innerContainer: [
      "overflow-x: auto",
      `line-height: ${BLUE_THEME_SETTINGS.codeBlockLineHeight}`,
      "margin: 0px",
      `background: ${themeStyle.content.background}`,
      `color: ${themeStyle.content.color}`,
      `padding: ${BLUE_THEME_SETTINGS.codeBlockHeaderPadding}`,
    ].join("; "),
  });

  const wechatStyles = generateWechatStyles(themeStyle);
  /**
   * 格式化代码行为微信公众号格式
   * 每行代码包装在<code><span>标签中，避免行号干扰复制
   * 对HTML特殊字符进行转义，防止代码中的<、>、&等被解析为HTML标签
   */
  const formatCodeLines = (lines) => {
    return lines
      .map((line) => {
        // HTML实体转义
        const escapedLine = line
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
        // 空行需要保留为可见的换行，否则在微信编辑器中会被折叠
        const content = escapedLine === "" ? "<br>" : escapedLine;
        return `<code style="font-size: ${BASE_CONFIG.sizes.code};">${content}</code>`;
      })
      .join("");
  };

  /**
   * 生成苹果风格的代码块头部
   * 包含三个彩色圆点装饰
   */
  const generateAppleHeader = (styles, colors, mappedLang) => {
    // 确保颜色值存在，如果不存在则使用默认的苹果风格颜色
    const redColor = colors.red || "#ff5f57";
    const yellowColor = colors.yellow || "#ffbd2e";
    const greenColor = colors.green || "#28c940";

    // 为圆点之间添加间距
    const getCircleStyleWithMargin = (color, marginRight = "0") => {
      const baseStyle = styles.getCircleStyle(color);
      return marginRight
        ? `${baseStyle}; margin-right: ${marginRight}`
        : baseStyle;
    };

    const elements = [
      `<section style="${styles.header}">`,
      `<section  style="${styles.toolsLeft}">`,
      `<span  style="${getCircleStyleWithMargin(redColor, "4px")}">&#9679;</span>`,
      `<span  style="${getCircleStyleWithMargin(yellowColor, "4px")}">&#9679;</span>`,
      `<span  style="${getCircleStyleWithMargin(greenColor)}">&#9679;</span>`,
      `</section>`,
      `<section style="${styles.toolsRight}">${mappedLang}</section>`,
      `</section>`,
    ];
    return elements.join("");
  };

  // 格式化代码内容
  const formattedCodeLines = formatCodeLines(codeLines);

  // 生成苹果风格头部
  const appleHeader = generateAppleHeader(
    wechatStyles,
    themeStyle.dots,
    mappedLang,
  );

  /**
   * 组装完整的微信公众号代码块HTML
   * 严格按照微信公众号编辑器要求的嵌套结构
   */
  const codeBlockElements = [
    `<pre class="code-snippet__js code-snippet code-snippet_nowrap" data-lang="${mappedLang}" style="${wechatStyles.outerContainer}">`,
    appleHeader,
    `<pre style="${wechatStyles.innerContainer}">`,
    formattedCodeLines,
    `</pre>`,
    `</pre>`,
  ];
  const result = codeBlockElements.join("");
  return result;
}
