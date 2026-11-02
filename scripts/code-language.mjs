export const detectCodeLanguage = (code) => {
  const trimmed = code.trim();
  if (!trimmed) return "Text";
  if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "JSON";
    } catch {}
  }
  if (/^<!doctype html|^<html\b|^<[a-z][\w-]*(?:\s[^<>]*)?>[\s\S]*<\/[a-z][\w-]*>$/i.test(trimmed)) return "HTML";
  if (/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b/im.test(trimmed)) return "SQL";
  if (/^(?:#!.*\b(?:bash|sh)|(?:\$ |npm |npx |git |cd |mkdir |echo |export ))/m.test(trimmed)) return "Shell";
  if (/^(?:def\s+\w+\s*\(|class\s+\w+.*:|from\s+\w+ import |import\s+\w+|print\s*\()/m.test(trimmed)) return "Python";
  if (/^(?:package\s+\w+|func\s+\w+\s*\(|import\s*\(\s*")/m.test(trimmed)) return "Go";
  if (/^(?:fn\s+\w+|let\s+mut\s+|use\s+\w+::)/m.test(trimmed)) return "Rust";
  if (/^(?:const |let |var |function |export |import |\/\/)|=>|console\.log\(/m.test(trimmed)) return "JavaScript";
  if (/^[.#]?[a-z][\w-]*\s*\{[\s\S]*:[\s\S]*;[\s\S]*\}/i.test(trimmed)) return "CSS";
  return "Text";
};

export const normalizeLanguage = (language, code) => {
  const aliases = new Map([
    ["bash", "Bash"],
    ["c", "C"],
    ["cpp", "C++"],
    ["csharp", "C#"],
    ["cs", "C#"],
    ["css", "CSS"],
    ["go", "Go"],
    ["html", "HTML"],
    ["java", "Java"],
    ["javascript", "JavaScript"],
    ["js", "JavaScript"],
    ["json", "JSON"],
    ["jsx", "JSX"],
    ["markdown", "Markdown"],
    ["md", "Markdown"],
    ["py", "Python"],
    ["python", "Python"],
    ["rb", "Ruby"],
    ["ruby", "Ruby"],
    ["rs", "Rust"],
    ["rust", "Rust"],
    ["sh", "Shell"],
    ["shell", "Shell"],
    ["sql", "SQL"],
    ["plain", "Text"],
    ["plaintext", "Text"],
    ["text", "Text"],
    ["ts", "TypeScript"],
    ["tsx", "TSX"],
    ["typescript", "TypeScript"],
    ["yml", "YAML"],
    ["yaml", "YAML"]
  ]);
  return aliases.get(language.trim().toLowerCase()) ?? detectCodeLanguage(code);
};
