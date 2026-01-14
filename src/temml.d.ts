declare module 'temml' {
  interface TemmlOptions {
    displayMode?: boolean
    xml?: boolean
    throwOnError?: boolean
    macros?: Record<string, string>
  }
  
  function renderToString(latex: string, options?: TemmlOptions): string
  
  export default {
    renderToString
  }
}
