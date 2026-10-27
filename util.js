function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function escJs(value) {
  return String(value == null ? "" : value).replace(/[\\'"&\n\r\u2028\u2029<>]/g, (ch) => ({
    "\\": "\\\\",
    "'": "\\'",
    '"': '\\"',
    "&": "\\u0026",
    "\n": "\\n",
    "\r": "\\r",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
    "<": "\\u003c",
    ">": "\\u003e"
  }[ch]));
}
