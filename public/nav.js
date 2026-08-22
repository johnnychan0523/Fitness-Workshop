// Shared navigation and theme bootstrap for all public pages.
(function () {
  const theme = document.createElement('link');
  theme.rel = 'stylesheet';
  theme.href = '/theme.css';
  document.head.appendChild(theme);

  const skipLink = document.createElement('a');
  skipLink.className = 'skip-link';
  skipLink.href = '#page-content';
  skipLink.textContent = '跳到主要內容';

  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.setAttribute('aria-label', '主要導覽');
  nav.innerHTML = `
    <a class="nav-brand" href="/start1.html" aria-label="健身工作坊首頁">
      <span class="brand-mark" aria-hidden="true">FW</span>
      <span class="brand-copy">FITNESS WORKSHOP<small>訓練・裝備・成長</small></span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="開啟選單">☰</button>
    <div class="nav-links" id="primary-nav">
      <a href="/start1.html">首頁</a>
      <a href="/index1.html">關於我們</a>
      <a href="/class/course.html">課程介紹</a>
      <a href="/equipment.html">器材購買</a>
      <a href="/connection/connection1.html">聯絡我們</a>
      <a href="/cart.html" class="nav-cart">購物車<span id="cart-badge" aria-label="購物車商品數量"></span></a>
      <a href="/loginpage" class="nav-auth" id="auth-link">登入</a>
    </div>`;

  document.body.prepend(nav);
  document.body.prepend(skipLink);

  const toggle = nav.querySelector('.nav-toggle');
  const closeMenu = () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '開啟選單');
  };
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => { if (!nav.contains(event.target)) closeMenu(); });

  const path = window.location.pathname.toLowerCase();
  const activeLink = Array.from(nav.querySelectorAll('.nav-links a')).find(link => {
    const href = link.getAttribute('href').toLowerCase();
    if (href === '/start1.html') return path === '/' || path.endsWith('/start1.html');
    if (href === '/index1.html') return path.endsWith('/index1.html') || path.includes('/coach/');
    if (href === '/class/course.html') return path.includes('/class/');
    if (href === '/connection/connection1.html') return path.includes('/connection/');
    return path.endsWith(href);
  });
  if (activeLink) {
    activeLink.classList.add('active');
    activeLink.setAttribute('aria-current', 'page');
  }

  const updateCartBadge = count => {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    badge.textContent = count > 0 ? String(count) : '';
    badge.style.display = count > 0 ? 'flex' : 'none';
  };
  window.updateSharedCartBadge = updateCartBadge;

  fetch('/me')
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (!data || !data.帳號) return;
      const userBadge = document.createElement('span');
      userBadge.className = 'nav-user';
      userBadge.title = data.帳號;
      userBadge.textContent = data.帳號;
      nav.querySelector('.nav-links').insertBefore(userBadge, nav.querySelector('.nav-cart'));
      const authLink = document.getElementById('auth-link');
      authLink.href = '/logout';
      authLink.textContent = '登出';
    })
    .catch(() => {});

  fetch('/cart/count')
    .then(response => response.ok ? response.json() : { count: 0 })
    .then(data => updateCartBadge(Number(data.count) || 0))
    .catch(() => updateCartBadge(0));

  document.addEventListener('DOMContentLoaded', () => {
    const mainTarget = document.querySelector('main, .hero, .page-header, .back-link, .back-btn, section, .container');
    if (mainTarget && !mainTarget.id) mainTarget.id = 'page-content';
    document.querySelectorAll('footer').forEach(footer => {
      footer.innerHTML = `&copy; ${new Date().getFullYear()} 健身工作坊・保持規律，持續進步`;
    });
  });
})();
