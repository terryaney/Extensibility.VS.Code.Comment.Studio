/* KAT Comment Studio — documentation site
 *
 * Routing is hash-based so the whole site is static files:
 *   #/settings                 -> settings article
 *   #/settings/pattern-processing -> settings article, scrolled to that heading
 *
 * Articles are HTML fragments in articles/<id>.html, fetched on demand and
 * cached. The nav, the on-this-page list, and the pager are all derived from
 * assets/manifest.json plus the headings in the loaded fragment. */

(() => {
	'use strict';

	const nav = document.getElementById('ksNav');
	const article = document.getElementById('ksArticle');
	const toc = document.getElementById('ksToc');
	const pager = document.getElementById('ksPager');
	const search = document.getElementById('ksSearch');
	const sidebar = document.getElementById('ksSidebar');
	const scrim = document.getElementById('ksScrim');
	const navToggle = document.getElementById('ksNavToggle');
	const themeToggle = document.getElementById('ksThemeToggle');

	const cache = new Map();
	let topics = [];
	let currentId = null;

	/* ---------- theme ---------- */

	const storedTheme = localStorage.getItem('ks-theme');
	if (storedTheme) document.documentElement.setAttribute('data-theme', storedTheme);

	themeToggle.addEventListener('click', () => {
		const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		localStorage.setItem('ks-theme', next);
	});

	/* ---------- mobile nav ---------- */

	function closeNav() {
		sidebar.classList.remove('is-open');
		scrim.hidden = true;
		navToggle.setAttribute('aria-expanded', 'false');
	}

	navToggle.addEventListener('click', () => {
		const open = sidebar.classList.toggle('is-open');
		scrim.hidden = !open;
		navToggle.setAttribute('aria-expanded', String(open));
	});
	scrim.addEventListener('click', closeNav);

	/* ---------- routing ---------- */

	function parseHash() {
		const raw = location.hash.replace(/^#\/?/, '');
		const [id, heading] = raw.split('/');
		return { id: id || 'overview', heading: heading || '' };
	}

	function slug(text) {
		return text.toLowerCase().trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-');
	}

	async function loadArticle(id) {
		if (cache.has(id)) return cache.get(id);
		const res = await fetch(`articles/${id}.html`);
		if (!res.ok) throw new Error(`${id}: ${res.status}`);
		const html = await res.text();
		cache.set(id, html);
		return html;
	}

	function buildToc() {
		const headings = [...article.querySelectorAll('h2, h3')];
		if (headings.length < 2) {
			toc.innerHTML = '';
			return;
		}

		const used = new Set();
		const links = headings.map(h => {
			const label = h.textContent.trim();
			if (!h.id) {
				let base = slug(label), candidate = base, n = 2;
				while (used.has(candidate)) candidate = `${base}-${n++}`;
				h.id = candidate;
			}
			used.add(h.id);

			const permalink = document.createElement('a');
			permalink.className = 'ks-anchor';
			permalink.href = `#/${currentId}/${h.id}`;
			permalink.textContent = '#';
			permalink.setAttribute('aria-hidden', 'true');
			h.appendChild(permalink);

			const cls = h.tagName === 'H3' ? 'is-sub' : '';
			return `<a class="${cls}" href="#/${currentId}/${h.id}" data-target="${h.id}">${label}</a>`;
		});

		toc.innerHTML = `<div class="ks-toc-title">On this page</div>${links.join('')}`;
		observeHeadings(headings);
	}

	let trackedHeadings = [];
	let scrollListenerBound = false;
	let scrollQueued = false;

	function observeHeadings(headings) {
		trackedHeadings = headings;

		if (!scrollListenerBound) {
			const queue = () => {
				if (scrollQueued) return;
				scrollQueued = true;
				requestAnimationFrame(() => { scrollQueued = false; updateActiveHeading(); });
			};
			window.addEventListener('scroll', queue, { passive: true });
			window.addEventListener('resize', queue, { passive: true });
			scrollListenerBound = true;
		}

		updateActiveHeading();
	}

	// Picks the last heading scrolled past rather than relying on intersection,
	// so exactly one entry is always active — including at the very top and bottom.
	function updateActiveHeading() {
		if (!trackedHeadings.length) return;

		const scroller = document.scrollingElement || document.documentElement;
		const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;

		let active = trackedHeadings[0];
		if (atBottom) {
			active = trackedHeadings[trackedHeadings.length - 1];
		} else {
			for (const heading of trackedHeadings) {
				if (heading.getBoundingClientRect().top > 100) break;
				active = heading;
			}
		}

		toc.querySelectorAll('a').forEach(a =>
			a.classList.toggle('is-active', a.dataset.target === active.id));
	}

	function buildPager(index) {
		const prev = topics[index - 1];
		const next = topics[index + 1];
		const parts = [];
		if (prev) parts.push(`<a href="#/${prev.id}"><small>Previous</small><strong>${prev.title}</strong></a>`);
		if (next) parts.push(`<a class="ks-pager-next" href="#/${next.id}"><small>Next</small><strong>${next.title}</strong></a>`);
		pager.innerHTML = parts.join('');
	}

	function markActiveNav(id) {
		nav.querySelectorAll('a').forEach(a =>
			a.classList.toggle('is-active', a.dataset.id === id));
	}

	function scrollToHeading(headingId) {
		if (!headingId) {
			window.scrollTo({ top: 0, behavior: 'auto' });
			return;
		}
		const target = document.getElementById(headingId);
		if (target) target.scrollIntoView({ block: 'start' });
	}

	async function route() {
		const { id, heading } = parseHash();
		const index = topics.findIndex(t => t.id === id);

		if (index === -1) {
			article.innerHTML = `<h1>Not found</h1><p>No topic named <code>${id}</code>. <a href="#/overview">Back to the overview</a>.</p>`;
			toc.innerHTML = '';
			pager.innerHTML = '';
			return;
		}

		if (id !== currentId) {
			try {
				article.innerHTML = await loadArticle(id);
			} catch {
				article.innerHTML = `<h1>Could not load</h1><p>The topic <code>${id}</code> failed to load.</p>`;
				toc.innerHTML = '';
				pager.innerHTML = '';
				return;
			}
			currentId = id;
			document.title = `${topics[index].title} — KAT Comment Studio`;
			buildToc();
			buildPager(index);
			markActiveNav(id);
			article.focus({ preventScroll: true });
		}

		scrollToHeading(heading);
		closeNav();
	}

	/* ---------- nav + search ---------- */

	function buildNav() {
		let group = null;
		const html = [];
		for (const topic of topics) {
			if (topic.group !== group) {
				group = topic.group;
				html.push(`<div class="ks-nav-group" data-group="${group}">${group}</div>`);
			}
			html.push(`<a href="#/${topic.id}" data-id="${topic.id}" data-search="${(topic.title + ' ' + topic.blurb).toLowerCase()}">${topic.title}</a>`);
		}
		nav.innerHTML = html.join('');
	}

	search.addEventListener('input', () => {
		const term = search.value.trim().toLowerCase();
		nav.querySelectorAll('a').forEach(a =>
			a.classList.toggle('is-hidden', term !== '' && !a.dataset.search.includes(term)));

		// Hide a group heading when everything under it is filtered out.
		nav.querySelectorAll('.ks-nav-group').forEach(heading => {
			let visible = false;
			for (let el = heading.nextElementSibling; el && !el.classList.contains('ks-nav-group'); el = el.nextElementSibling) {
				if (!el.classList.contains('is-hidden')) { visible = true; break; }
			}
			heading.style.display = visible ? '' : 'none';
		});
	});

	/* ---------- boot ---------- */

	(async () => {
		try {
			topics = await fetch('assets/manifest.json').then(r => r.json());
		} catch {
			article.innerHTML = '<h1>Documentation unavailable</h1><p>The topic manifest could not be loaded.</p>';
			return;
		}
		buildNav();
		window.addEventListener('hashchange', route);
		await route();
	})();
})();
