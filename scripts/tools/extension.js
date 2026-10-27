// 导入主题配置
import { BLUE_THEME } from "./theme.js";

// 新增的简洁样式 - 左侧对话气泡
const leftBubbleTemplateSimple = (
  text
) => `<section style="margin: 15px 0; display: flex; align-items: flex-start; max-width: 100%;"><section style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex-shrink: 0; margin-right: 10; z-index: 2;"><img src="https://mmbiz.qpic.cn/mmbiz_png/n3RS3ib3lbz9eb3erDiaTehfcKeIuEOkuMCicQg8P6VjyDD2ey6MCJibBUkBkQ7WC9icz4drEmzN0ZpL2k0duTWE3sQ/0?wx_fmt=png&from=appmsg" alt="头像" style="width: 100%; height: 100%; object-fit: cover;"></section><section style="display: flex; margin-left: 8px;"><!-- 使用 border 技术创建三角形尖角 --><section style="width: 0; height: 0; border-style: solid; border-width: 8px 9px 8px 0; border-color: transparent #f0f0f0 transparent transparent; align-self: center; z-index: 1; margin-right: -1px;"></section><section style="background-color: #f0f0f0; border-radius: 0 18px 18px 18px; padding: 12px 16px; max-width: 70%; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1;"><p style="margin: 0; font-size: 15px; line-height: 1.4; color: #333;">${text}</p></section></section></section>
`;

// 新增的简洁样式 - 右侧对话气泡
const rightBubbleTemplateSimple = (text) => `
<section style="margin: 15px 0; display: flex; align-items: flex-start; justify-content: flex-end; max-width: 100%;"><section style="display: flex; margin-right: 8px;"><section style="background-color: #95ec69; border-radius: 18px 0 18px 18px; padding: 12px 16px; max-width: 70%; box-shadow: 0 1px 2px rgba(0,0,0,0.1); z-index: 1;"><p style="margin: 0; font-size: 15px; line-height: 1.4; color: #000;">${text}</p></section><!-- 使用 border 技术创建三角形尖角 --><section style="width: 0; height: 0; border-style: solid; border-width: 8px 0 8px 9px; border-color: transparent transparent transparent #95ec69; align-self: center; z-index: 1; margin-left: -1px;"></section></section><section style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex-shrink: 0; margin-left: 10; z-index: 2;"><img src="https://mmbiz.qpic.cn/mmbiz_png/n3RS3ib3lbz9eb3erDiaTehfcKeIuEOkuMBvmoiaC5BdwPjhv1AZx2NficiaDWjNdia6fkxTjCGUiaeicQR1lClZCiaVTEQ/0?wx_fmt=png&from=appmsg" alt="头像" style="width: 100%; height: 100%; object-fit: cover;"></section></section>
`;

export function getDialogueExtension() {
  const dialogueExtension = {
    name: "dialogue",
    level: "block",
    start(src) {
      // 检查是否以样式标记开始，或者以常规对话标记开始
      const styleMatch = src.match(/^::(simple|original)::\n/);
      if (styleMatch) {
        // 如果有样式标记，检查下一行是否是对话
        const nextLineIndex = styleMatch[0].length;
        const nextLine = src.substring(nextLineIndex).match(/^>(L|R):/);
        if (nextLine) {
          return styleMatch.index;
        }
      }

      // 否则检查是否以常规对话标记开始
      return src.match(/^>(L|R):/)?.index;
    },
    tokenizer(src, tokens) {
      // 首先检查是否有样式标记
      const styleRule = /^::(simple|original)::\n/;
      const styleMatch = styleRule.exec(src);
      let style = "simple"; // 默认样式
      let consumed = 0; // 已处理的字符数

      if (styleMatch) {
        style = styleMatch[1];
        consumed = styleMatch[0].length;
      }

      // 然后匹配对话内容
      const dialogueSrc = src.substring(consumed);
      const rule = /^(?:>(L|R): (.*)(?:\n|$))+/i;
      const match = rule.exec(dialogueSrc);

      if (match) {
        const token = {
          type: "dialogue",
          raw: src.substring(0, consumed + match[0].length),
          style: style,
          // 解析出每一行对话
          dialogues: match[0]
            .trim()
            .split(/\r?\n/)
            .map((line) => {
              const parts = line.match(/^>(L|R): (.*)/i);
              // 修复 TypeScript 错误：检查 parts 是否存在
              if (parts) {
                return {
                  side: parts[1].toUpperCase() === "L" ? "left" : "right",
                  text: parts[2]
                };
              }
              // 如果没有匹配到，返回默认值
              return {
                side: "left",
                text: ""
              };
            })
        };
        return token;
      }
    },
    // 渲染器，将上面 tokenizer 生成的 token 转换成 HTML
    renderer(token) {
      // 遍历每一句对话，根据左右和样式生成不同的 HTML，最后拼接起来
      return token.dialogues
        .map((dialogue) => {
          // 根据样式和方向选择正确的模板
          if (dialogue.side === "left") {
            return leftBubbleTemplateSimple(dialogue.text);
          } else {
            return rightBubbleTemplateSimple(dialogue.text);
          }
        })
        .join("");
    }
  };
  return dialogueExtension;
}

// 自定义嵌套加粗斜体tokenizer扩展
export function getNestedBoldItalicExtension() {
  const nestedBoldItalicExtension = {
    name: "nestedBoldItalic",
    level: "inline",
    start(src) {
      // 检查是否可能包含嵌套的加粗斜体语法
      const hasNestedPattern = src.match(/\*\*_|__\*/);
      return hasNestedPattern ? src.indexOf(hasNestedPattern[0]) : -1;
    },
    tokenizer(src, tokens) {
      // 匹配 **_text_** 或 __*text*__ 模式
      const rule = /^(\*\*_([^_]+)_\*\*|__\*([^*]+)\*__)/;
      const match = rule.exec(src);
      
      if (match) {
        const text = match[2] || match[3]; // 获取内部文本
        return {
          type: "nestedBoldItalic",
          raw: match[0],
          text: text.trim()
        };
      }
    },
    renderer(token) {
      // 渲染为加粗斜体
      const accentColor = BLUE_THEME.accent; // 使用蓝色主题的品牌色
      return `<strong style="color: ${accentColor}; font-weight: 700;"><i style="color: ${accentColor}; font-style: italic;">${token.text}</i></strong>`;
    }
  };
  return nestedBoldItalicExtension;
}
// export function getUnderlineExtension() {
//   const underlineExtension = {
//     name: "underline",
//     level: "inline", // 可以是 'block' 或 'inline'
//     start(src) {
//       // 可选：检查源是否可能包含此标记的函数
//       return src.indexOf("__");
//     },
//     tokenizer(src, tokens) {
//       // 匹配下划线语法
//       const rule = /^__([^_]+)__/;
//       const match = rule.exec(src);
//       if (match) {
//         return {
//           type: "underline",
//           raw: match[0], // 匹配的文本
//           text: match[1].trim() // 下划线内的内容
//         };
//       }
//     },
//     renderer(token) {
//       // 将标记渲染为 HTML
//       return `<u>${token.text}</u>`;
//     }
//   };
//   return underlineExtension;
// }
export function getHighlightExtension() {
  const highlightExtension = {
    name: "highlight",
    level: "inline",
    start(src) {
      return src.indexOf("==");
    },
    tokenizer: function (src, tokens) {
      const rule = /^==([^=]+)==/;
      const match = rule.exec(src);
      if (match) {
        const text = match[1];
        return {
          type: "highlight",
          raw: match[0],
          text: text,
          tokens: this.lexer.inlineTokens(text)
        };
      }
    },
    renderer: function (token) {
      const bgColor = BLUE_THEME.markBg;
      const textColor = BLUE_THEME.markText;
      // return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
      return `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 4px; border-radius: 3px; font-weight: 500;">${this.parser.parseInline(token.tokens)}</span>`;
    }
  };
  return highlightExtension;
}
