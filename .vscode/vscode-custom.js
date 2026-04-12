// KAT Comment Studio — tag hover popup for scoped CSS.
// VS Code reuses the same .monaco-hover widget for all hovers (IntelliSense,
// extensions, etc.) — only the content changes. KAT hovers are identified by
// the presence of a $(book) codicon heading (rendered as .codicon-book), which
// IntelliSense and other extension hovers won't produce. Skip unrelated
// mutations (editor keystrokes, tree updates, etc.) to avoid unnecessary scanning.
const katObserver = new MutationObserver((mutations) => {
	const relevant = mutations.some(m =>
		m.target.closest?.('.monaco-hover') ||
		Array.from(m.addedNodes).some(n =>
			n.nodeType === 1 &&
			(n.classList?.contains('monaco-hover') || n.querySelector?.('.monaco-hover'))
		)
	);

	if (!relevant) return;

	document.querySelectorAll('.monaco-hover .monaco-tokenized-source').forEach(h => {
		// As a 'flag' we always put trailing 5 spaces in last line of code fenced code.  Only clean way to get a 'marker' that it is our popup we are coloring
		const isKat = h.querySelector('span:last-child')?.textContent?.slice(-5) === "     ";
		if (isKat) {
			const monacoHover = h.closest('.monaco-hover');
			if (monacoHover) {
				const updateStyle = (styleName, propertyName, current) => {
					if (current) {
						const val = parseFloat(current);
						const newVal = val + 12; // padding 10 + 2 border
						monacoHover.style[propertyName] = `${newVal}px`;
						// find all decendant elements with inline style of height set to same as currentHeight, and update it to newHeight
						monacoHover.querySelectorAll(`[style*="${styleName}: ${current}"]`).forEach(el => {
							el.style[propertyName] = `${newVal}px`;
						});
					}
				}
				updateStyle('height', 'height', monacoHover.style.height);
				updateStyle('max-height', 'maxHeight', monacoHover.style.maxHeight);
				updateStyle('width', 'width', monacoHover.style.width);
				updateStyle('max-width', 'maxWidth', monacoHover.style.maxWidth);
			}

			h.classList.add('kat-comment-hover');
		} else {
			h.classList.remove('kat-comment-hover');
		}
	});
});

katObserver.observe(document.body, { childList: true, subtree: true });
