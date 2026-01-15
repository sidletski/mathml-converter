import { useState, useMemo, useCallback } from "react";
import temml from "temml";
import { mml2omml } from "mathml2omml";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import "./App.css";

const EXAMPLE_TEXT = `The Schrödinger equation governs quantum mechanics:
$$i\\hbar \\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi$$

In thermodynamics, entropy $S$ relates to microstates via $S = k_B \\ln \\Omega$.

Maxwell's equations in differential form:
$$\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}$$

The Euler identity: $e^{i\\pi} + 1 = 0$ connects five fundamental constants.

Integral example: $\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$

Sum example: $\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$`;

// Convert LaTeX to MathML using Temml
function latexToMathML(latex: string, displayMode: boolean): string {
  return temml.renderToString(latex, {
    displayMode,
    xml: true,
  });
}

// Convert MathML to OMML for Word documents
function mathmlToOmml(mathml: string): string {
  return mml2omml(mathml);
}

// For display: converts to HTML with MathML
function parseForDisplay(input: string): string {
  const regex = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const textBefore = input.slice(lastIndex, match.index);
    result += escapeAndFormat(textBefore);

    const latex = match[1] || match[2];
    const isBlock = !!match[1];

    try {
      const mathml = latexToMathML(latex, isBlock);
      const escapedLatex = escapeHtml(latex).replace(/"/g, "&quot;");
      result += `<span class="math-formula" data-latex="${escapedLatex}" data-block="${isBlock}">${mathml}</span>`;
    } catch {
      result += `<span class="error">${escapeHtml(match[0])}</span>`;
    }

    lastIndex = match.index + match[0].length;
  }

  result += escapeAndFormat(input.slice(lastIndex));
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAndFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\r\n/g, "<br>")
    .replace(/\n/g, "<br>")
    .replace(/\r/g, "<br>");
}

// Content item for document generation
type ContentItem =
  | { type: "text"; value: string }
  | { type: "math"; omml: string; isBlock: boolean };

// Generate Word document with proper OMML
async function generateDocx(input: string): Promise<Blob> {
  const regex = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Parse content into items, preserving order and inline structure
  const items: ContentItem[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore) {
      items.push({ type: "text", value: textBefore });
    }

    const latex = match[1] || match[2];
    const isBlock = !!match[1];

    try {
      const mathml = latexToMathML(latex, isBlock);
      const omml = mathmlToOmml(mathml);
      items.push({ type: "math", omml, isBlock });
    } catch {
      // Fallback on error
      items.push({ type: "text", value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  const textAfter = text.slice(lastIndex);
  if (textAfter) {
    items.push({ type: "text", value: textAfter });
  }

  // Build paragraphs - keeping inline math in the same paragraph as surrounding text
  const paragraphs: Paragraph[] = [];
  const mathPlaceholders: Map<string, string> = new Map();
  let placeholderIndex = 0;

  // Group items by paragraph breaks (double newlines create new paragraphs)
  // Block math ($$ $$) also creates its own paragraph
  let currentParagraphItems: Array<{ type: "text"; value: string } | { type: "placeholder"; id: string }> = [];

  const flushParagraph = (alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) => {
    if (currentParagraphItems.length === 0) return;

    const children = currentParagraphItems.map(item => {
      if (item.type === "text") {
        return new TextRun(item.value);
      } else {
        return new TextRun(item.id);
      }
    });

    if (children.length > 0) {
      paragraphs.push(new Paragraph({ children, alignment }));
    }
    currentParagraphItems = [];
  };

  for (const item of items) {
    if (item.type === "math" && item.isBlock) {
      // Block math: flush current paragraph, add math as its own centered paragraph
      flushParagraph();

      const placeholder = `__MATH_PLACEHOLDER_${placeholderIndex}__`;
      mathPlaceholders.set(placeholder, item.omml);
      placeholderIndex++;

      paragraphs.push(
        new Paragraph({
          children: [new TextRun(placeholder)],
          alignment: AlignmentType.CENTER,
        })
      );
    } else if (item.type === "math") {
      // Inline math: add placeholder to current paragraph
      const placeholder = `__MATH_PLACEHOLDER_${placeholderIndex}__`;
      mathPlaceholders.set(placeholder, item.omml);
      placeholderIndex++;
      currentParagraphItems.push({ type: "placeholder", id: placeholder });
    } else {
      // Text: split by double newlines for paragraph breaks
      const parts = item.value.split(/\n\n+/);

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (i > 0) {
          // Double newline means new paragraph
          flushParagraph();
        }

        // Replace single newlines with spaces for Word
        const cleanedText = part.replace(/\n/g, " ");
        if (cleanedText) {
          currentParagraphItems.push({ type: "text", value: cleanedText });
        }
      }
    }
  }

  // Flush any remaining content
  flushParagraph();

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  // Get the blob and convert to text for post-processing
  const blob = await Packer.toBlob(doc);

  // If no math, return as-is
  if (mathPlaceholders.size === 0) {
    return blob;
  }

  // Post-process: replace placeholders with actual OMML
  const arrayBuffer = await blob.arrayBuffer();
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Get document.xml
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) {
    return blob;
  }

  // Replace placeholders with OMML
  let modifiedXml = documentXml;
  for (const [placeholder, omml] of mathPlaceholders) {
    // The placeholder appears as: <w:t>__MATH_PLACEHOLDER_X__</w:t>
    // We need to replace the entire <w:r>...</w:r> containing it with the OMML
    const placeholderPattern = new RegExp(
      `<w:r[^>]*>\\s*<w:t[^>]*>${placeholder}</w:t>\\s*</w:r>`,
      "g"
    );
    modifiedXml = modifiedXml.replace(placeholderPattern, omml);
  }

  // Update the zip
  zip.file("word/document.xml", modifiedXml);

  // Return the modified blob
  const modifiedBlob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  return modifiedBlob;
}

// ============================================================================
// REACT COMPONENT
// ============================================================================

function App() {
  const [input, setInput] = useState(EXAMPLE_TEXT);
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    latex: string;
    isBlock: boolean;
  } | null>(null);

  const displayOutput = useMemo(() => parseForDisplay(input), [input]);

  const handleDownloadDocx = async () => {
    const blob = await generateDocx(input);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "document.docx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const regex = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      result += input.slice(lastIndex, match.index);
      const latex = match[1] || match[2];
      const isBlock = !!match[1];
      try {
        result += latexToMathML(latex, isBlock);
      } catch {
        result += match[0];
      }
      lastIndex = match.index + match[0].length;
    }
    result += input.slice(lastIndex);
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const mathFormula = target.closest(".math-formula") as HTMLElement | null;

      if (mathFormula) {
        e.preventDefault();
        const latex = mathFormula.dataset.latex || "";
        const isBlock = mathFormula.dataset.block === "true";
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          latex: latex
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&"),
          isBlock,
        });
      }
    },
    []
  );

  const handleCopyMathML = useCallback(async () => {
    if (!contextMenu) return;

    try {
      const mathml = latexToMathML(contextMenu.latex, contextMenu.isBlock);
      await navigator.clipboard.writeText(mathml);
      setContextMenu(null);
    } catch (err) {
      console.error("Failed to copy MathML:", err);
    }
  }, [contextMenu]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleClickOutside = useCallback(() => {
    if (contextMenu) {
      setContextMenu(null);
    }
  }, [contextMenu]);

  return (
    <div className="container" onClick={handleClickOutside}>
      <header className="header">
        <h1>LaTeX → MathML</h1>
        <p className="subtitle">
          Convert LaTeX formulas to MathML. Use <code>$...$</code> for inline
          and <code>$$...$$</code> for block formulas.
          <br />
          <em>Right-click on any formula to copy its MathML.</em>
        </p>
      </header>

      <main className="editor">
        <div className="panel input-panel">
          <div className="panel-header">
            <span className="panel-title">Input</span>
            <span className="panel-hint">Text + LaTeX</span>
          </div>
          <textarea
            className="textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter text with LaTeX formulas..."
            spellCheck={false}
          />
        </div>

        <div className="panel output-panel">
          <div className="panel-header">
            <span className="panel-title">Output</span>
            <div className="button-group">
              <button className="copy-btn secondary" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy MathML"}
              </button>
              <button className="copy-btn" onClick={handleDownloadDocx}>
                Download .docx
              </button>
            </div>
          </div>
          <div
            id="output"
            className="output"
            onContextMenu={handleContextMenu}
            dangerouslySetInnerHTML={{ __html: displayOutput }}
          />
        </div>
      </main>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleCopyMathML}>Copy MathML</button>
          <button onClick={handleCloseContextMenu}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default App;
