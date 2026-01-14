import { useState, useMemo } from "react";
import temml from "temml";
import "./App.css";

const EXAMPLE_TEXT = `The Schrödinger equation governs quantum mechanics:
$$i\\hbar \\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi$$

In thermodynamics, entropy $S$ relates to microstates via $S = k_B \\ln \\Omega$.

Maxwell's equations in differential form:
$$\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}$$
$$\\nabla \\times \\vec{B} = \\mu_0\\vec{J} + \\mu_0\\varepsilon_0\\frac{\\partial \\vec{E}}{\\partial t}$$

The Euler identity: $e^{i\\pi} + 1 = 0$ connects five fundamental constants.

A matrix example: $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}^{-1} = \\frac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$`;

function parseAndConvert(input: string): string {
  // Pattern matches both $...$ and $$...$$
  // We need to handle $$ first to avoid matching single $ inside $$
  const regex = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;

  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    // Add text before the match
    result += escapeHtml(input.slice(lastIndex, match.index));

    const latex = match[1] || match[2]; // match[1] for $$...$$, match[2] for $...$
    const isBlock = !!match[1];

    try {
      const mathml = temml.renderToString(latex, {
        displayMode: isBlock,
        xml: true,
      });
      result += mathml;
    } catch (e) {
      // If parsing fails, show the original LaTeX
      result += `<span class="error">${escapeHtml(match[0])}</span>`;
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  result += escapeHtml(input.slice(lastIndex));

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

function App() {
  const [input, setInput] = useState(EXAMPLE_TEXT);

  const output = useMemo(() => parseAndConvert(input), [input]);

  const handleCopy = async () => {
    const outputEl = document.getElementById("output");
    if (outputEl) {
      await navigator.clipboard.writeText(outputEl.innerHTML);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>LaTeX → MathML</h1>
        <p className="subtitle">
          Convert LaTeX formulas to MathML. Use <code>$...$</code> for inline
          and <code>$$...$$</code> for block formulas.
        </p>
      </header>

      <main className="editor">
        <div className="panel input-panel">
          <div className="panel-header">
            <span className="panel-title">Input</span>
            <span className="panel-hint">Markdown + LaTeX</span>
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
            <button className="copy-btn" onClick={handleCopy}>
              Copy HTML
            </button>
          </div>
          <div
            id="output"
            className="output"
            dangerouslySetInnerHTML={{ __html: output }}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
