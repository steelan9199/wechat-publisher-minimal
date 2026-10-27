/**
 * 公式渲染器 - 将 LaTeX 公式转换为内联 SVG
 * 使用 MathJax 生成 SVG，然后直接嵌入到 HTML 中
 */

// 使用 mathjax-full 替代 mathjax，避免 Windows 路径问题
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

// 初始化 MathJax
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const texInput = new TeX({
  packages: AllPackages,
});

const svgOutput = new SVG({
  fontCache: "none",
  scale: 1.2,
});

const mj = mathjax.document("", {
  InputJax: texInput,
  OutputJax: svgOutput,
});

/**
 * 将 LaTeX 公式转换为内联 SVG HTML
 * @param {string} formula - LaTeX 公式内容
 * @param {boolean} isDisplay - 是否是行间公式（display math）
 * @returns {Promise<string>} SVG HTML 字符串
 */
export async function formulaToSvg(formula, isDisplay = true) {
  try {
    // 清理公式内容
    let cleanFormula = formula.trim();

    // 使用 MathJax 渲染
    const node = mj.convert(cleanFormula, {
      display: isDisplay,
    });

    // 获取 SVG 字符串
    let svgString = adaptor.outerHTML(node);

    // 处理 SVG 样式，使其在微信中居中显示
    svgString = svgString.replace(
      /<svg/,
      '<svg style="vertical-align: middle;"',
    );

    // 包装在 section 中，实现居中
    const wrappedHtml = `<section class="block-equation" style="text-align: center; overflow-x: auto; margin: 16px 0;">${svgString}</section>`;

    return wrappedHtml;
  } catch (error) {
    console.error("公式渲染失败:", formula, error.message);
    // 渲染失败时返回原始公式文本
    return `<p style="text-align: center; color: #ff0000;">[公式渲染失败: ${formula}]</p>`;
  }
}

/**
 * 处理 Markdown 内容中的所有公式
 * 将 $$...$$ 格式的行间公式和 $...$ 格式的行内公式替换为 SVG
 * 注意：代码块中的 $ 符号不会被处理
 * @param {string} markdownContent - Markdown 内容
 * @returns {Promise<string>} 处理后的 HTML 内容
 */
export async function processFormulas(markdownContent) {
  let result = markdownContent;

  // 第一步：保护代码块内容，将代码块替换为占位符
  const codeBlockMap = new Map(); // 使用 Map 存储占位符和对应的内容
  let codeBlockCounter = 0;
  let inlineCodeCounter = 0;

  // 匹配 ```...``` 格式的代码块（包括语言标识）
  const codeBlockRegex = /```[\s\S]*?```/g;
  result = result.replace(codeBlockRegex, (match) => {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlockCounter}__`;
    codeBlockMap.set(placeholder, match);
    codeBlockCounter++;
    return placeholder;
  });

  // 匹配行内代码 `...`
  const inlineCodeRegex = /`[^`]+`/g;
  result = result.replace(inlineCodeRegex, (match) => {
    const placeholder = `__INLINE_CODE_PLACEHOLDER_${inlineCodeCounter}__`;
    codeBlockMap.set(placeholder, match);
    inlineCodeCounter++;
    return placeholder;
  });

  // 第二步：处理行间公式 $$...$$
  const blockFormulaRegex = /\$\$\s*([\s\S]*?)\s*\$\$/g;
  const blockMatches = Array.from(result.matchAll(blockFormulaRegex));

  // 从后往前替换，避免位置偏移
  for (let i = blockMatches.length - 1; i >= 0; i--) {
    const match = blockMatches[i];
    const fullMatch = match[0];
    const formula = match[1].trim();
    const startIndex = match.index;

    // 渲染公式为 SVG（行间公式，display: true）
    const svgHtml = await formulaToSvg(formula, true);

    // 替换
    result =
      result.slice(0, startIndex) +
      svgHtml +
      result.slice(startIndex + fullMatch.length);
  }

  // 第三步：处理行内公式 $...$
  // 使用正则匹配单个 $ 包围的内容，排除 $$ 的情况
  const inlineFormulaRegex = /(?<!\$)\$([^\$\n]+?)\$(?!\$)/g;
  const inlineMatches = Array.from(result.matchAll(inlineFormulaRegex));

  // 从后往前替换，避免位置偏移
  for (let i = inlineMatches.length - 1; i >= 0; i--) {
    const match = inlineMatches[i];
    const fullMatch = match[0];
    const formula = match[1].trim();
    const startIndex = match.index;

    // 渲染公式为 SVG（行内公式，display: false）
    const svgHtml = await formulaToInlineSvg(formula);

    // 替换
    result =
      result.slice(0, startIndex) +
      svgHtml +
      result.slice(startIndex + fullMatch.length);
  }

  // 第四步：恢复代码块内容
  // 先恢复代码块（从后往前恢复，避免位置偏移）
  for (let i = codeBlockCounter - 1; i >= 0; i--) {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${i}__`;
    const code = codeBlockMap.get(placeholder);
    if (code) {
      const placeholderRegex = new RegExp(
        placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g",
      );
      result = result.replace(placeholderRegex, code);
    }
  }
  // 恢复行内代码（从后往前恢复）
  for (let i = inlineCodeCounter - 1; i >= 0; i--) {
    const placeholder = `__INLINE_CODE_PLACEHOLDER_${i}__`;
    const code = codeBlockMap.get(placeholder);
    if (code) {
      const placeholderRegex = new RegExp(
        placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g",
      );
      result = result.replace(placeholderRegex, code);
    }
  }

  return result;
}

/**
 * 检查内容中是否包含公式
 * 支持行间公式 $$...$$ 和行内公式 $...$
 * @param {string} content - 内容
 * @returns {boolean} 是否包含公式
 */
export function hasFormula(content) {
  // 检查行间公式 $$...$$
  if (/\$\$[\s\S]*?\$\$/.test(content)) {
    return true;
  }
  // 检查行内公式 $...$（排除 $$ 的情况）
  if (/(?<!\$)\$[^\$\n]+?\$(?!\$)/.test(content)) {
    return true;
  }
  return false;
}

/**
 * 将 LaTeX 公式转换为行内 SVG HTML
 * @param {string} formula - LaTeX 公式内容
 * @returns {Promise<string>} 行内 SVG HTML 字符串
 */
async function formulaToInlineSvg(formula) {
  try {
    // 清理公式内容
    let cleanFormula = formula.trim();

    // 使用 MathJax 渲染
    const node = mj.convert(cleanFormula, {
      display: false,
    });

    // 获取 SVG 字符串
    let svgString = adaptor.outerHTML(node);

    // 处理 SVG 样式，使其在行内正确显示
    svgString = svgString.replace(
      /<svg/,
      '<svg style="display: inline-block; vertical-align: middle;"',
    );

    return svgString;
  } catch (error) {
    console.error("行内公式渲染失败:", formula, error.message);
    // 渲染失败时返回原始公式文本
    return `<span style="color: #ff0000;">[公式渲染失败: ${formula}]</span>`;
  }
}
