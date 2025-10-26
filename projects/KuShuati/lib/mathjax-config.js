// MathJax配置文件
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    processEnvironments: true
  },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    ignoreHtmlClass: 'tex2jax_ignore',
    processHtmlClass: 'tex2jax_process'
  },
  startup: {
    ready: function () {
      console.log('MathJax is loaded and ready.');
      MathJax.startup.defaultReady();
    }
  }
};

// 渲染LaTeX的辅助函数
function renderMathJax(element) {
  if (window.MathJax && window.MathJax.typesetPromise) {
    return window.MathJax.typesetPromise([element]).catch(function (err) {
      console.error('MathJax rendering error:', err);
    });
  }
  return Promise.resolve();
}

// 全局渲染函数
function renderAllMath() {
  if (window.MathJax && window.MathJax.typesetPromise) {
    return window.MathJax.typesetPromise().catch(function (err) {
      console.error('MathJax rendering error:', err);
    });
  }
  return Promise.resolve();
}
