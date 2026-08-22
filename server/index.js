const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const port = 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fitness-workshop-local-development-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 3600000
  }
}));

// 購物車屬於會員功能；其他內容可直接瀏覽。
app.use((req, res, next) => {
  if (req.path.toLowerCase() === '/cart.html' && !req.session.userId) {
    return res.redirect('/loginpage?next=/cart.html');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'views')));
app.use(express.static(path.join(__dirname, '..', 'public')));

const dbPath = path.join(__dirname, 'test_user.db');
const db = new sqlite3.Database(dbPath);

// 器材定價表（伺服器端定價，防止前端竄改）
const PRICES = {
  '啞鈴組': 1500,
  '槓鈴組': 3000,
  '跑步機': 15000,
  '腿推機': 8000,
  '飛輪單車': 5000,
  '瑜珈墊套組': 300
};

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    帳號 TEXT NOT NULL UNIQUE,
    信箱 TEXT NOT NULL DEFAULT '',
    密碼 TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS cart (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    帳號  TEXT NOT NULL,
    器材  TEXT NOT NULL,
    單價  INTEGER NOT NULL,
    數量  INTEGER NOT NULL DEFAULT 1,
    UNIQUE(帳號, 器材)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    帳號  TEXT NOT NULL,
    總金額 INTEGER NOT NULL,
    狀態  TEXT NOT NULL DEFAULT '待處理',
    時間  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    訂單id  INTEGER NOT NULL,
    器材    TEXT NOT NULL,
    數量    INTEGER NOT NULL,
    單價    INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    帳號        TEXT NOT NULL DEFAULT '訪客',
    使用日期    TEXT,
    使用時數    REAL,
    年齡層      TEXT,
    使用器材    TEXT,
    器材滿意度  TEXT,
    器材意見    TEXT,
    課程        TEXT,
    教練滿意度  TEXT,
    其他意見    TEXT,
    建立時間    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`);
});

// ── 帳號 ──────────────────────────────────────────────

app.get('/', (_, res) => res.redirect('/start1.html'));
app.get('/signuppage', (_, res) => res.sendFile(path.join(__dirname, 'views', 'Sign.html')));
app.get('/loginpage', (req, res) => {
  if (req.session.userId) return res.redirect('/start1.html');
  res.sendFile(path.join(__dirname, 'views', 'Login.html'));
});

app.post('/addUser', (req, res) => {
  const 帳號 = String(req.body.帳號 || '').trim();
  const 信箱 = String(req.body.信箱 || '').trim().toLowerCase();
  const 密碼 = String(req.body.密碼 || '');
  if (!帳號 || !信箱 || !密碼) {
    return res.status(400).json({ success: false, message: '請填寫所有欄位' });
  }
  if (帳號.length < 2 || 帳號.length > 50) {
    return res.status(400).json({ success: false, message: '帳號需為 2 到 50 個字元' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(信箱)) {
    return res.status(400).json({ success: false, message: '請輸入有效的電子信箱' });
  }
  if (密碼.length < 6 || 密碼.length > 72) {
    return res.status(400).json({ success: false, message: '密碼需為 6 到 72 個字元' });
  }
  bcrypt.hash(密碼, 10, (err, hash) => {
    if (err) return res.status(500).json({ success: false, message: 'Internal server error.' });
    db.run('INSERT INTO user (帳號, 信箱, 密碼) VALUES (?, ?, ?)', [帳號, 信箱, hash], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE'))
          return res.status(409).json({ success: false, message: '此帳號已被使用' });
        return res.status(500).json({ success: false, message: 'Internal server error.' });
      }
      res.json({ success: true, message: '註冊成功' });
    });
  });
});

app.post('/login', (req, res) => {
  const 帳號 = String(req.body.帳號 || '').trim();
  const 密碼 = String(req.body.密碼 || '');
  if (!帳號 || !密碼)
    return res.status(400).json({ success: false, message: '請填寫所有欄位' });
  db.get('SELECT * FROM user WHERE 帳號 = ?', [帳號], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: 'Internal server error.' });
    if (!row) return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    bcrypt.compare(密碼, row.密碼, (err, match) => {
      if (err || !match) return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
      req.session.regenerate(sessionError => {
        if (sessionError) return res.status(500).json({ success: false, message: '登入暫時無法使用，請稍後再試' });
        req.session.userId = row.id;
        req.session.帳號 = row.帳號;
        res.json({ success: true, message: '登入成功', user: { 帳號: row.帳號 } });
      });
    });
  });
});

app.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '未登入' });
  res.json({ 帳號: req.session.帳號 });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/start1.html'));
});

app.post('/feedback', (req, res) => {
  const asList = value => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean).slice(0, 10);
    return value ? [String(value)] : [];
  };
  const trimTo = (value, max) => String(value || '').trim().slice(0, max);
  const 使用日期 = trimTo(req.body.使用日期, 10);
  const 使用時數 = Number(req.body.使用時數);
  const 年齡層 = trimTo(req.body.年齡層, 20);
  const 使用器材 = asList(req.body.使用器材).join('、');
  const 器材滿意度 = trimTo(req.body.器材滿意度, 10);
  const 器材意見 = trimTo(req.body.器材意見, 1000);
  const 課程 = asList(req.body.課程).join('、');
  const 教練滿意度 = trimTo(req.body.教練滿意度, 10);
  const 其他意見 = trimTo(req.body.其他意見, 1000);

  if (!使用日期 && !年齡層 && !使用器材 && !器材滿意度 && !器材意見 && !課程 && !教練滿意度 && !其他意見) {
    return res.status(400).json({ success: false, message: '請至少填寫一項內容' });
  }
  if (使用日期 && !/^\d{4}-\d{2}-\d{2}$/.test(使用日期)) {
    return res.status(400).json({ success: false, message: '使用日期格式不正確' });
  }
  const safeDuration = Number.isFinite(使用時數) && 使用時數 >= 0.5 && 使用時數 <= 24 ? 使用時數 : null;

  db.run(
    `INSERT INTO feedback
     (帳號, 使用日期, 使用時數, 年齡層, 使用器材, 器材滿意度, 器材意見, 課程, 教練滿意度, 其他意見)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.session.帳號 || '訪客', 使用日期 || null, safeDuration, 年齡層, 使用器材, 器材滿意度, 器材意見, 課程, 教練滿意度, 其他意見],
    function(err) {
      if (err) return res.status(500).json({ success: false, message: '回饋暫時無法送出，請稍後再試' });
      res.json({ success: true, message: '謝謝你的回饋，我們已經收到！', feedbackId: this.lastID });
    }
  );
});

// ── 購物車 ────────────────────────────────────────────

app.get('/cart', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '請先登入' });
  db.all('SELECT id, 器材, 單價, 數量 FROM cart WHERE 帳號 = ?', [req.session.帳號], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Internal server error.' });
    res.json({ items: rows });
  });
});

app.get('/cart/count', (req, res) => {
  if (!req.session.userId) return res.json({ count: 0 });
  db.get('SELECT SUM(數量) as total FROM cart WHERE 帳號 = ?', [req.session.帳號], (_, row) => {
    res.json({ count: (row && row.total) || 0 });
  });
});

app.post('/cart', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: '請先登入' });
  const { 器材, 數量 } = req.body;
  const qty = Math.min(99, Math.max(1, parseInt(數量, 10) || 1));
  const price = PRICES[器材];
  if (!price) return res.status(400).json({ success: false, message: '找不到此器材' });

  db.run(
    `INSERT INTO cart (帳號, 器材, 單價, 數量) VALUES (?, ?, ?, ?)
     ON CONFLICT(帳號, 器材) DO UPDATE SET 數量 = MIN(99, 數量 + ?)`,
    [req.session.帳號, 器材, price, qty, qty],
    function(err) {
      if (err) return res.status(500).json({ success: false, message: 'Internal server error.' });
      res.json({ success: true, message: `已將「${器材}」加入購物車` });
    }
  );
});

app.put('/cart/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: '請先登入' });
  const qty = Math.min(99, Math.max(1, parseInt(req.body.數量, 10) || 1));
  db.run(
    'UPDATE cart SET 數量 = ? WHERE id = ? AND 帳號 = ?',
    [qty, req.params.id, req.session.帳號],
    function(err) {
      if (err) return res.status(500).json({ success: false });
      if (this.changes === 0) return res.status(404).json({ success: false, message: '找不到此購物車商品' });
      res.json({ success: true });
    }
  );
});

app.delete('/cart/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: '請先登入' });
  db.run(
    'DELETE FROM cart WHERE id = ? AND 帳號 = ?',
    [req.params.id, req.session.帳號],
    function(err) {
      if (err) return res.status(500).json({ success: false });
      if (this.changes === 0) return res.status(404).json({ success: false, message: '找不到此購物車商品' });
      res.json({ success: true });
    }
  );
});

// ── 結帳 / 訂單 ───────────────────────────────────────

app.post('/checkout', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: '請先登入' });
  const 帳號 = req.session.帳號;

  db.all('SELECT * FROM cart WHERE 帳號 = ?', [帳號], (err, items) => {
    if (err) return res.status(500).json({ success: false, message: 'Internal server error.' });
    if (!items.length) return res.status(400).json({ success: false, message: '購物車是空的' });

    const total = items.reduce((sum, i) => sum + i.單價 * i.數量, 0);

    db.run('INSERT INTO orders (帳號, 總金額) VALUES (?, ?)', [帳號, total], function(err) {
      if (err) return res.status(500).json({ success: false, message: 'Internal server error.' });
      const orderId = this.lastID;
      const stmt = db.prepare('INSERT INTO order_items (訂單id, 器材, 數量, 單價) VALUES (?, ?, ?, ?)');
      let itemError = null;
      items.forEach(i => stmt.run(orderId, i.器材, i.數量, i.單價, insertError => {
        if (insertError) itemError = insertError;
      }));
      stmt.finalize(finalizeError => {
        if (itemError || finalizeError) {
          db.run('DELETE FROM order_items WHERE 訂單id = ?', [orderId]);
          db.run('DELETE FROM orders WHERE id = ?', [orderId]);
          return res.status(500).json({ success: false, message: '訂單建立失敗，請稍後再試' });
        }
        db.run('DELETE FROM cart WHERE 帳號 = ?', [帳號], deleteError => {
          if (deleteError) return res.status(500).json({ success: false, message: '訂單已建立，但購物車更新失敗，請重新整理' });
          res.json({ success: true, message: '訂單已成立！', orderId });
        });
      });
    });
  });
});

app.get('/orders', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '請先登入' });
  db.all(
    'SELECT id, 總金額, 狀態, 時間 FROM orders WHERE 帳號 = ? ORDER BY id DESC',
    [req.session.帳號],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Internal server error.' });
      res.json({ orders: rows });
    }
  );
});

app.delete('/orders/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: '請先登入' });
  db.run(
    'DELETE FROM orders WHERE id = ? AND 帳號 = ?',
    [req.params.id, req.session.帳號],
    function(err) {
      if (err) return res.status(500).json({ success: false });
      if (this.changes === 0) return res.status(404).json({ success: false, message: '找不到此訂單' });
      db.run('DELETE FROM order_items WHERE 訂單id = ?', [req.params.id], itemError => {
        if (itemError) return res.status(500).json({ success: false, message: '訂單明細刪除失敗' });
        res.json({ success: true });
      });
    }
  );
});

// ─────────────────────────────────────────────────────

const shutdown = () => db.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
