// Warehouse Management App (Express.js + SQLite + Sequelize)
// Versi 5.4 – Role Admin/Operator/Staff + Import Excel (Admin only)

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const QRCode = require('qrcode');
const SQLiteStore = require('connect-sqlite3')(session);
const ExcelJS = require('exceljs');
const multer = require('multer'); // <-- TAMBAHAN

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATABASE (SQLite + Sequelize) ====================
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './warehouse.db',
  logging: false
});

// ==================== MODEL ====================

// MODEL CATEGORY (harus didefinisikan lebih dulu karena direferensi oleh User dan Item)
const Category = sequelize.define('Category', {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.TEXT }
}, { timestamps: true });

// MODEL USER (dengan categoryId)
const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'operator', 'staff'), defaultValue: 'operator' },
  categoryId: { type: DataTypes.INTEGER, allowNull: true, references: { model: Category, key: 'id' } }
});

// Relasi User - Category
User.belongsTo(Category, { foreignKey: 'categoryId' });
Category.hasMany(User, { foreignKey: 'categoryId' });

// MODEL ITEM
const Item = sequelize.define('Item', {
  article: { type: DataTypes.STRING, allowNull: false },
  komponen: { type: DataTypes.STRING, allowNull: false },
  noPo: { type: DataTypes.STRING },
  order: { type: DataTypes.INTEGER, defaultValue: 0 },
  qty: { type: DataTypes.INTEGER, defaultValue: 0 },
  kolom: { type: DataTypes.STRING },
  minStock: { type: DataTypes.INTEGER, defaultValue: 10 },
  categoryId: { type: DataTypes.INTEGER, allowNull: true, references: { model: Category, key: 'id' } }
}, { timestamps: true });

// MODEL QTY HISTORY
const QtyHistory = sequelize.define('QtyHistory', {
  itemId: { type: DataTypes.INTEGER, allowNull: false, references: { model: Item, key: 'id' } },
  article: { type: DataTypes.STRING, allowNull: false },
  oldQty: { type: DataTypes.INTEGER, allowNull: false },
  newQty: { type: DataTypes.INTEGER, allowNull: false },
  changeAmount: { type: DataTypes.INTEGER, allowNull: false },
  changeType: { type: DataTypes.ENUM('manual','adjustment','inbound','outbound','correction','qr_scan'), defaultValue: 'manual' },
  notes: { type: DataTypes.TEXT },
  updatedBy: { type: DataTypes.STRING, defaultValue: 'System' }
}, { timestamps: true, indexes: [{ fields: ['itemId'] }, { fields: ['createdAt'] }] });

// MODEL LOKASI
const Location = sequelize.define('Location', {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  capacity: { type: DataTypes.INTEGER, defaultValue: 100 },
  currentItems: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { timestamps: true });

// MODEL SCAN LOG
const ScanLog = sequelize.define('ScanLog', {
  itemId: { type: DataTypes.INTEGER, allowNull: false },
  article: { type: DataTypes.STRING },
  scanType: { type: DataTypes.ENUM('qr','barcode','manual'), defaultValue: 'qr' },
  scanData: { type: DataTypes.TEXT },
  action: { type: DataTypes.ENUM('search','update','check_in','check_out') },
  result: { type: DataTypes.TEXT },
  scannedBy: { type: DataTypes.STRING, defaultValue: 'System' }
}, { timestamps: true });

// ASSOCIATIONS
Item.hasMany(QtyHistory, { foreignKey: 'itemId', onDelete: 'CASCADE' });
QtyHistory.belongsTo(Item, { foreignKey: 'itemId' });
Item.belongsTo(Location, { foreignKey: 'locationId' });
Location.hasMany(Item, { foreignKey: 'locationId' });
Item.hasMany(ScanLog, { foreignKey: 'itemId', onDelete: 'CASCADE' });
ScanLog.belongsTo(Item, { foreignKey: 'itemId' });

Category.hasMany(Item, { foreignKey: 'categoryId' });
Item.belongsTo(Category, { foreignKey: 'categoryId' });

// ==================== SESSION CONFIG ====================
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: './' }),
  secret: 'warehouse-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 hari
}));

// ==================== AUTH MIDDLEWARE ====================
function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized - Silakan login terlebih dahulu' });
}

function isAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Forbidden - Hanya untuk admin' });
}

function isAdminOrStaff(req, res, next) {
  if (req.session.role === 'admin' || req.session.role === 'staff') return next();
  res.status(403).json({ error: 'Forbidden - Hanya untuk admin atau staff' });
}

// Helper untuk menambahkan filter kategori ke WHERE clause
function addCategoryFilter(req, where) {
  if (req.session.role !== 'admin' && req.session.categoryId) {
    where.categoryId = req.session.categoryId;
  }
  return where;
}

// ==================== SYNC DATABASE & SEED DEFAULT USERS ====================
sequelize.sync({ alter: true }).then(async () => {
  const adminExists = await User.findOne({ where: { username: 'admin' } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin', 10);
    await User.create({ username: 'admin', password: hashedPassword, role: 'admin', categoryId: null });
    console.log('✅ Default admin created (admin/admin)');
  }
  const operatorExists = await User.findOne({ where: { username: 'operator' } });
  if (!operatorExists) {
    const hashedPassword = await bcrypt.hash('operator', 10);
    await User.create({ username: 'operator', password: hashedPassword, role: 'operator', categoryId: null });
    console.log('✅ Default operator created (operator/operator)');
  }
  const staffExists = await User.findOne({ where: { username: 'staff' } });
  if (!staffExists) {
    const hashedPassword = await bcrypt.hash('staff', 10);
    await User.create({ username: 'staff', password: hashedPassword, role: 'staff', categoryId: null });
    console.log('✅ Default staff created (staff/staff)');
  }
});

// ==================== AUTH ROUTES ====================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username } });
    if (!user) return res.status(401).json({ error: 'Username atau password salah' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Username atau password salah' });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.categoryId = user.categoryId;
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, categoryId: user.categoryId } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ id: req.session.userId, username: req.session.username, role: req.session.role, categoryId: req.session.categoryId });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ==================== USER MANAGEMENT (ADMIN ONLY) ====================
app.get('/api/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'categoryId', 'createdAt', 'updatedAt'],
      include: [{ model: Category, attributes: ['name'] }]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', isAuthenticated, isAdmin, async (req, res) => {
  const { username, password, role, categoryId } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const existing = await User.findOne({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      password: hashedPassword,
      role: role || 'operator',
      categoryId: categoryId || null
    });
    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      categoryId: newUser.categoryId,
      createdAt: newUser.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.destroy();
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CATEGORY MANAGEMENT (ADMIN ONLY) ====================
app.get('/api/categories', isAuthenticated, async (req, res) => {
  try {
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const category = await Category.create({ name, description });
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    await category.update(req.body);
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const itemsCount = await Item.count({ where: { categoryId: req.params.id } });
    if (itemsCount > 0) {
      return res.status(400).json({ error: 'Kategori masih digunakan oleh item' });
    }
    const usersCount = await User.count({ where: { categoryId: req.params.id } });
    if (usersCount > 0) {
      return res.status(400).json({ error: 'Kategori masih digunakan oleh user' });
    }
    await category.destroy();
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API ROUTES (semua harus login) ====================

// 1. CREATE ITEM (admin atau staff) - dengan pembatasan kategori
app.post('/api/items', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const data = req.body;
    if (req.session.role !== 'admin') {
      if (data.categoryId && data.categoryId !== req.session.categoryId) {
        return res.status(403).json({ error: 'Anda hanya dapat menambah item dalam kategori Anda' });
      }
      data.categoryId = req.session.categoryId;
    }
    const item = await Item.create(data);
    if (req.body.qty > 0) {
      await QtyHistory.create({
        itemId: item.id,
        article: item.article,
        oldQty: 0,
        newQty: req.body.qty,
        changeAmount: req.body.qty,
        changeType: 'inbound',
        notes: 'Initial stock creation',
        updatedBy: req.session.username
      });
    }
    const itemWithCategory = await Item.findByPk(item.id, {
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });
    res.json(itemWithCategory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. LIST ITEMS (semua role) dengan include kategori dan filter kategori
app.get('/api/items', isAuthenticated, async (req, res) => {
  try {
    const where = {};
    addCategoryFilter(req, where);
    const order = [['updatedAt', 'DESC']];
    if (req.query.kolom) where.kolom = req.query.kolom;
    if (req.query.search) {
      where[Op.or] = [
        { article: { [Op.like]: `%${req.query.search}%` } },
        { komponen: { [Op.like]: `%${req.query.search}%` } },
        { noPo: { [Op.like]: `%${req.query.search}%` } },
        { kolom: { [Op.like]: `%${req.query.search}%` } }
      ];
    }
    if (req.query.lowStock === 'true') {
      where.qty = { [Op.lte]: sequelize.col('minStock') };
    }
    if (req.query.komponen) where.komponen = req.query.komponen;
    if (req.query.sortBy) {
      const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';
      order.unshift([req.query.sortBy, sortOrder]);
    } else {
      order.unshift(['kolom', 'ASC'], ['article', 'ASC']);
    }
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const items = await Item.findAll({
      order,
      where,
      limit,
      offset,
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });
    const total = await Item.count({ where });
    res.json({ items, total, limit, offset, hasMore: (offset + items.length) < total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET SINGLE ITEM (semua role) dengan pengecekan akses
app.get('/api/items/:id', isAuthenticated, async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id, {
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. UPDATE ITEM (admin atau staff) dengan pengecekan akses
app.put('/api/items/:id', isAuthenticated, isAdminOrStaff, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }
    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }
    if (req.body.categoryId && req.body.categoryId !== item.categoryId && req.session.role !== 'admin') {
      await transaction.rollback();
      return res.status(403).json({ error: 'Tidak dapat mengubah kategori item' });
    }
    const oldQty = item.qty;
    const newQty = req.body.qty !== undefined ? parseInt(req.body.qty) : oldQty;
    await item.update(req.body, { transaction });
    if (req.body.qty !== undefined && oldQty !== newQty) {
      const changeAmount = newQty - oldQty;
      const changeType = determineChangeType(changeAmount, req.body.changeType);
      await QtyHistory.create({
        itemId: item.id,
        article: item.article,
        oldQty,
        newQty,
        changeAmount,
        changeType,
        notes: req.body.changeNotes || `Qty updated from ${oldQty} to ${newQty}`,
        updatedBy: req.session.username
      }, { transaction });
    }
    await transaction.commit();
    const updatedItem = await Item.findByPk(item.id, {
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });
    res.json(updatedItem);
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE ITEM (hanya admin)
app.delete('/api/items/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    await QtyHistory.create({
      itemId: item.id,
      article: item.article,
      oldQty: item.qty,
      newQty: 0,
      changeAmount: -item.qty,
      changeType: 'outbound',
      notes: 'Item deleted from system',
      updatedBy: req.session.username
    });
    await item.destroy();
    res.json({ status: 'deleted', message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. UPDATE QTY dengan detail (semua role) dengan pengecekan akses
app.post('/api/items/:id/update-qty', isAuthenticated, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }
    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }
    const { newQty, changeType, notes, adjustment } = req.body;
    if (newQty === undefined && adjustment === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Either newQty or adjustment is required' });
    }
    const oldQty = item.qty;
    let finalQty = newQty !== undefined ? parseInt(newQty) : oldQty + parseInt(adjustment);
    if (finalQty < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Quantity cannot be negative' });
    }
    await item.update({ qty: finalQty }, { transaction });
    await QtyHistory.create({
      itemId: item.id,
      article: item.article,
      oldQty,
      newQty: finalQty,
      changeAmount: finalQty - oldQty,
      changeType: changeType || (adjustment !== undefined ? 'adjustment' : 'manual'),
      notes: notes || (adjustment !== undefined ? `Adjusted by ${adjustment > 0 ? '+' : ''}${adjustment}` : `Updated from ${oldQty} to ${finalQty}`),
      updatedBy: req.session.username
    }, { transaction });
    await transaction.commit();
    res.json({ success: true, item, message: `Qty updated from ${oldQty} to ${finalQty}` });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 7. GET QTY HISTORY (semua role) dengan pengecekan akses
app.get('/api/items/:id/qty-history', isAuthenticated, async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }
    const history = await QtyHistory.findAll({
      where: { itemId: req.params.id },
      order: [['createdAt', 'DESC']],
      limit: req.query.limit ? parseInt(req.query.limit) : 50
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. GET ALL QTY HISTORY (semua role) dengan filter kategori
app.get('/api/qty-history', isAuthenticated, async (req, res) => {
  try {
    const where = {};
    if (req.query.startDate) where.createdAt = { [Op.gte]: new Date(req.query.startDate) };
    if (req.query.endDate) where.createdAt = { ...where.createdAt, [Op.lte]: new Date(req.query.endDate) };
    if (req.query.changeType) where.changeType = req.query.changeType;

    const itemWhere = {};
    addCategoryFilter(req, itemWhere);

    const history = await QtyHistory.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100,
      include: [{
        model: Item,
        attributes: ['article', 'komponen', 'kolom', 'categoryId'],
        required: true,
        where: itemWhere
      }]
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET DASHBOARD STATS (semua role) dengan filter kategori
app.get('/api/dashboard/stats', isAuthenticated, async (req, res) => {
  try {
    const itemWhere = {};
    addCategoryFilter(req, itemWhere);

    const totalItems = await Item.count({ where: itemWhere });
    const totalQty = await Item.sum('qty', { where: itemWhere }) || 0;
    const totalOrder = await Item.sum('order', { where: itemWhere }) || 0;
    const lowStockItems = await Item.count({
      where: {
        ...itemWhere,
        qty: { [Op.lte]: sequelize.col('minStock') }
      }
    });
    const itemsByLocation = await Item.findAll({
      attributes: ['kolom', [sequelize.fn('COUNT', sequelize.col('id')), 'itemCount'], [sequelize.fn('SUM', sequelize.col('qty')), 'totalQty']],
      where: {
        ...itemWhere,
        kolom: { [Op.not]: null }
      },
      group: ['kolom'],
      order: [[sequelize.col('itemCount'), 'DESC']]
    });
    const recentActivities = await QtyHistory.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10,
      include: [{
        model: Item,
        attributes: ['article', 'komponen'],
        where: itemWhere,
        required: true
      }]
    });
    const recentScans = await ScanLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [{
        model: Item,
        attributes: ['article', 'komponen', 'kolom'],
        where: itemWhere,
        required: true
      }]
    });
    res.json({ totalItems, totalQty, totalOrder, lowStockItems, itemsByLocation, recentActivities, recentScans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET UNIQUE VALUES (semua role) dengan filter kategori
app.get('/api/unique-values', isAuthenticated, async (req, res) => {
  try {
    const itemWhere = {};
    addCategoryFilter(req, itemWhere);

    const komponen = await Item.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('komponen')), 'komponen']],
      where: { ...itemWhere, komponen: { [Op.not]: null } }
    });
    const kolom = await Item.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('kolom')), 'kolom']],
      where: { ...itemWhere, kolom: { [Op.not]: null } },
      order: [['kolom', 'ASC']]
    });
    res.json({
      komponen: komponen.map(k => k.komponen).filter(Boolean),
      kolom: kolom.map(k => k.kolom).filter(Boolean)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. BULK OPERATIONS (admin atau staff) dengan filter kategori
app.post('/api/items/bulk/update-qty', isAuthenticated, isAdminOrStaff, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items, changeType, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Items array is required' });
    }
    const results = [];
    for (const itemData of items) {
      const { id, adjustment, newQty } = itemData;
      const item = await Item.findByPk(id);
      if (!item) continue;
      if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
        continue;
      }
      const oldQty = item.qty;
      let finalQty = newQty !== undefined ? parseInt(newQty) : oldQty + parseInt(adjustment);
      if (finalQty < 0) continue;
      await item.update({ qty: finalQty }, { transaction });
      await QtyHistory.create({
        itemId: item.id,
        article: item.article,
        oldQty,
        newQty: finalQty,
        changeAmount: finalQty - oldQty,
        changeType: changeType || 'adjustment',
        notes: notes || `Bulk update: ${adjustment ? `Adjusted by ${adjustment}` : `Set to ${newQty}`}`,
        updatedBy: req.session.username
      }, { transaction });
      results.push({ id: item.id, article: item.article, oldQty, newQty: finalQty, success: true });
    }
    await transaction.commit();
    res.json({ success: true, updatedCount: results.length, results });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// ========== EXPORT SEMUA ITEM KE EXCEL (admin atau staff) ==========
app.get('/api/export/excel', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const itemWhere = {};
    addCategoryFilter(req, itemWhere);

    const items = await Item.findAll({
      where: itemWhere,
      order: [['kolom', 'ASC'], ['article', 'ASC']],
      include: [{ model: Category, attributes: ['name'] }]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Warehouse Items');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Article', key: 'article', width: 30 },
      { header: 'Komponen', key: 'komponen', width: 20 },
      { header: 'No PO', key: 'noPo', width: 15 },
      { header: 'Order', key: 'order', width: 10 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'Min Stock', key: 'minStock', width: 10 },
      { header: 'Lokasi', key: 'kolom', width: 15 },
      { header: 'Kategori', key: 'categoryName', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Updated At', key: 'updatedAt', width: 20 }
    ];

    items.forEach(item => {
      worksheet.addRow({
        id: item.id,
        article: item.article,
        komponen: item.komponen,
        noPo: item.noPo || '',
        order: item.order,
        qty: item.qty,
        minStock: item.minStock,
        kolom: item.kolom || '',
        categoryName: item.Category ? item.Category.name : '',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      });
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=warehouse-export-${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== EXPORT RIWAYAT QTY KE EXCEL (admin atau staff) ==========
app.post('/api/export/qty-history', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const { itemId, changeType, startDate } = req.body;
    const where = {};
    if (itemId) where.itemId = itemId;
    if (changeType) where.changeType = changeType;
    if (startDate) {
      where.createdAt = { [Op.gte]: new Date(startDate) };
    }

    const itemWhere = {};
    addCategoryFilter(req, itemWhere);

    const histories = await QtyHistory.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Item,
        attributes: ['article'],
        where: itemWhere,
        required: true
      }]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Qty History');

    worksheet.columns = [
      { header: 'Tanggal', key: 'createdAt', width: 20 },
      { header: 'Article', key: 'article', width: 30 },
      { header: 'Qty Lama', key: 'oldQty', width: 10 },
      { header: 'Qty Baru', key: 'newQty', width: 10 },
      { header: 'Perubahan', key: 'changeAmount', width: 12 },
      { header: 'Tipe', key: 'changeType', width: 15 },
      { header: 'Catatan', key: 'notes', width: 40 },
      { header: 'Oleh', key: 'updatedBy', width: 20 }
    ];

    histories.forEach(h => {
      worksheet.addRow({
        createdAt: new Date(h.createdAt).toLocaleString('id-ID'),
        article: h.article,
        oldQty: h.oldQty,
        newQty: h.newQty,
        changeAmount: h.changeAmount,
        changeType: h.changeType,
        notes: h.notes || '',
        updatedBy: h.updatedBy
      });
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=qty-history-${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. IMPORT CSV (admin atau staff) dengan pembatasan kategori
app.post('/api/import/csv', isAuthenticated, isAdminOrStaff, express.text({ type: 'text/csv' }), async (req, res) => {
  try {
    const csvData = req.body;
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    const importedItems = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(',');
      const itemData = {
        article: values[1]?.replace(/"/g, '') || '',
        komponen: values[2]?.replace(/"/g, '') || '',
        noPo: values[3]?.replace(/"/g, '') || '',
        order: parseInt(values[4]) || 0,
        qty: parseInt(values[5]) || 0,
        minStock: parseInt(values[6]) || 10,
        kolom: values[7]?.replace(/"/g, '') || ''
      };
      if (req.session.role !== 'admin') {
        itemData.categoryId = req.session.categoryId;
      }
      const item = await Item.create(itemData);
      importedItems.push(item);
    }
    res.json({ success: true, message: `Imported ${importedItems.length} items`, items: importedItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== IMPORT EXCEL (ADMIN ONLY) ==========
// Konfigurasi multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file Excel (.xlsx) yang diperbolehkan'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // maks 5MB
});

app.post('/api/import/excel', isAuthenticated, isAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File tidak ditemukan' });
  }

  const transaction = await sequelize.transaction();
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet(1); // sheet pertama

    if (!worksheet) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Sheet tidak ditemukan' });
    }

    // Ambil header (baris pertama)
    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.text?.toString().trim().toLowerCase();
    });

    // Mapping kolom yang diharapkan
    const requiredFields = ['article', 'komponen'];
    const columnMap = {
      article: headers.indexOf('article'),
      komponen: headers.indexOf('komponen'),
      noPo: headers.indexOf('nopo') !== -1 ? headers.indexOf('nopo') : headers.indexOf('no po'),
      order: headers.indexOf('order'),
      qty: headers.indexOf('qty'),
      minStock: headers.indexOf('minstock') !== -1 ? headers.indexOf('minstock') : headers.indexOf('min stock'),
      kolom: headers.indexOf('lokasi'),
      category: headers.indexOf('kategori') !== -1 ? headers.indexOf('kategori') : headers.indexOf('category')
    };

    // Validasi header wajib
    if (columnMap.article === -1 || columnMap.komponen === -1) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Kolom wajib "article" dan "komponen" tidak ditemukan' });
    }

    const importedItems = [];
    const errors = [];

    // Mulai dari baris ke-2 (data)
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (row.cellCount === 0) continue; // lewati baris kosong

      const getCellValue = (idx) => {
        if (idx === -1) return null;
        const cell = row.getCell(idx + 1); // exceljs 1-based
        return cell.text?.toString().trim() || null;
      };

      const article = getCellValue(columnMap.article);
      const komponen = getCellValue(columnMap.komponen);
      if (!article || !komponen) {
        errors.push(`Baris ${i}: article atau komponen kosong`);
        continue;
      }

      // Baca data lainnya
      const noPo = getCellValue(columnMap.noPo);
      const order = parseInt(getCellValue(columnMap.order)) || 0;
      const qty = parseInt(getCellValue(columnMap.qty)) || 0;
      const minStock = parseInt(getCellValue(columnMap.minStock)) || 10;
      const kolom = getCellValue(columnMap.kolom);
      const categoryName = getCellValue(columnMap.category);

      // Cari kategori berdasarkan nama (case‑insensitive)
      let categoryId = null;
      if (categoryName) {
        // Gunakan LOWER untuk case‑insensitive di SQLite
        const category = await Category.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            'LIKE',
            categoryName.toLowerCase()
          )
        });
        if (!category) {
          errors.push(`Baris ${i}: Kategori "${categoryName}" tidak ditemukan`);
          continue;
        }
        categoryId = category.id;
      }

      // Buat item
      const item = await Item.create({
        article,
        komponen,
        noPo,
        order,
        qty,
        minStock,
        kolom,
        categoryId
      }, { transaction });

      // Catat history jika qty > 0
      if (qty > 0) {
        await QtyHistory.create({
          itemId: item.id,
          article: item.article,
          oldQty: 0,
          newQty: qty,
          changeAmount: qty,
          changeType: 'inbound',
          notes: 'Import dari Excel',
          updatedBy: req.session.username
        }, { transaction });
      }

      importedItems.push(item);
    }

    if (errors.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: 'Terdapat kesalahan pada data', 
        details: errors 
      });
    }

    await transaction.commit();
    res.json({ 
      success: true, 
      message: `Berhasil mengimport ${importedItems.length} item`, 
      count: importedItems.length 
    });

  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 14. BACKUP (hanya admin) - tidak perlu filter
app.get('/api/backup', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const backupData = await Item.findAll();
    const backupDate = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=warehouse-backup-${backupDate}.json`);
    res.json({ timestamp: new Date(), itemCount: backupData.length, items: backupData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. LOCATION MANAGEMENT (admin atau staff) - tidak perlu filter
app.get('/api/locations', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const locations = await Location.findAll({
      include: [{ model: Item, attributes: ['id', 'article', 'qty'] }],
      order: [['name', 'ASC']]
    });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const location = await Location.create(req.body);
    res.json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. GENERATE LABEL DATA (admin atau staff) dengan pengecekan akses
app.get('/api/items/:id/label-data', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id, {
      include: [{ model: Category, attributes: ['name'] }]
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }
    const qrData = JSON.stringify({ id: item.id, article: item.article, komponen: item.komponen, location: item.kolom, category: item.Category?.name, minStock: item.minStock, timestamp: new Date().toISOString(), action: 'scan_update' });
    const qrCodeDataURL = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H', type: 'image/png', margin: 1, scale: 6, color: { dark: '#000000', light: '#FFFFFF' } });
    const labelData = { id: item.id, article: item.article, komponen: item.komponen, noPo: item.noPo, qty: item.qty, minStock: item.minStock, kolom: item.kolom, category: item.Category?.name, createdAt: item.createdAt, barcodeData: `ITEM${item.id.toString().padStart(6, '0')}`, qrData, qrCodeDataURL };
    res.json(labelData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17. GENERATE BULK LABELS (admin atau staff) dengan filter kategori
app.post('/api/labels/bulk', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ message: 'Item IDs array is required' });

    const where = { id: itemIds };
    addCategoryFilter(req, where);

    const items = await Item.findAll({
      where,
      order: [['kolom', 'ASC'], ['article', 'ASC']],
      include: [{ model: Category, attributes: ['name'] }]
    });

    if (items.length === 0) {
      return res.status(403).json({ message: 'No accessible items found' });
    }

    const labels = [];
    for (const item of items) {
      const qrData = JSON.stringify({ id: item.id, article: item.article, komponen: item.komponen, location: item.kolom, category: item.Category?.name, qty: item.qty, minStock: item.minStock, timestamp: new Date().toISOString(), action: 'scan_update' });
      const qrCodeDataURL = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H', type: 'image/png', margin: 1, scale: 6, color: { dark: '#000000', light: '#FFFFFF' } });
      labels.push({ id: item.id, article: item.article, komponen: item.komponen, qty: item.qty, kolom: item.kolom, minStock: item.minStock, noPo: item.noPo || '', category: item.Category?.name, barcode: `WH${item.id.toString().padStart(6, '0')}`, qrData, qrCodeDataURL, timestamp: new Date().toISOString() });
    }
    res.json({ success: true, count: labels.length, labels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 18. QR SCAN & SEARCH (semua role) dengan filter kategori
app.post('/api/qr-scan', isAuthenticated, async (req, res) => {
  try {
    const { qrData, type = 'auto' } = req.body;
    if (!qrData) return res.status(400).json({ message: 'QR data is required' });

    let where = {};
    addCategoryFilter(req, where);

    if (type === 'full' || type === 'auto') {
      try {
        const parsedData = JSON.parse(qrData);
        if (parsedData.id) where.id = parsedData.id;
        else if (parsedData.article) where.article = { [Op.like]: `%${parsedData.article}%` };
      } catch (err) {
        if (!isNaN(qrData)) where.id = parseInt(qrData);
        else if (qrData.match(/ITEM\d+/i) || qrData.match(/WH\d+/i)) {
          const itemId = parseInt(qrData.replace(/[^0-9]/g, ''));
          where.id = itemId;
        } else {
          where[Op.or] = [
            { article: { [Op.like]: `%${qrData}%` } },
            { komponen: { [Op.like]: `%${qrData}%` } },
            { kolom: { [Op.like]: `%${qrData}%` } }
          ];
        }
      }
    } else if (type === 'id') {
      if (!isNaN(qrData)) where.id = parseInt(qrData);
      else {
        const itemId = qrData.replace(/[^0-9]/g, '');
        if (itemId) where.id = parseInt(itemId);
      }
    } else if (type === 'article') {
      where.article = { [Op.like]: `%${qrData}%` };
    }

    const items = await Item.findAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit: 10,
      include: [{ model: Category, attributes: ['name'] }]
    });

    if (items.length > 0) {
      await ScanLog.create({
        itemId: items[0].id,
        article: items[0].article,
        scanType: 'qr',
        scanData: qrData,
        action: 'search',
        result: `Found ${items.length} items`,
        scannedBy: req.session.username
      });
    }

    if (items.length === 0) return res.status(404).json({ success: false, message: 'Item tidak ditemukan', qrData, type });

    res.json({ success: true, count: items.length, items, qrData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 19. QUICK UPDATE VIA QR (semua role) dengan pengecekan akses
app.post('/api/qr-quick-update', isAuthenticated, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { qrData, adjustment, newQty, changeType, notes } = req.body;
    if (!qrData) { await transaction.rollback(); return res.status(400).json({ message: 'QR data is required' }); }
    if (adjustment === undefined && newQty === undefined) { await transaction.rollback(); return res.status(400).json({ message: 'Either adjustment or newQty is required' }); }

    let itemId; let item;
    try {
      const parsedData = JSON.parse(qrData);
      if (parsedData.id) itemId = parsedData.id;
    } catch (err) {
      if (!isNaN(qrData)) itemId = parseInt(qrData);
      else if (qrData.match(/ITEM\d+/i) || qrData.match(/WH\d+/i)) itemId = parseInt(qrData.replace(/[^0-9]/g, ''));
      else item = await Item.findOne({ where: { article: { [Op.like]: `%${qrData}%` } } });
    }
    if (!item) item = await Item.findByPk(itemId);
    if (!item) { await transaction.rollback(); return res.status(404).json({ message: 'Item tidak ditemukan' }); }

    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }

    const oldQty = item.qty;
    let finalQty;
    if (newQty !== undefined) finalQty = parseInt(newQty);
    else finalQty = oldQty + parseInt(adjustment);
    if (finalQty < 0) { await transaction.rollback(); return res.status(400).json({ message: 'Quantity cannot be negative' }); }

    await item.update({ qty: finalQty }, { transaction });
    await QtyHistory.create({
      itemId: item.id,
      article: item.article,
      oldQty,
      newQty: finalQty,
      changeAmount: finalQty - oldQty,
      changeType: changeType || (adjustment > 0 ? 'inbound' : adjustment < 0 ? 'outbound' : 'qr_scan'),
      notes: notes || `QR Scan Update: ${newQty !== undefined ? `Set to ${newQty}` : `Adjusted by ${adjustment > 0 ? '+' : ''}${adjustment}`}`,
      updatedBy: req.session.username
    }, { transaction });
    await ScanLog.create({
      itemId: item.id,
      article: item.article,
      scanType: 'qr',
      scanData: qrData,
      action: 'update',
      result: `Qty updated: ${oldQty} → ${finalQty}`,
      scannedBy: req.session.username
    }, { transaction });

    await transaction.commit();
    res.json({ success: true, item, message: `Qty updated via QR: ${oldQty} → ${finalQty} (${finalQty - oldQty > 0 ? '+' : ''}${finalQty - oldQty})` });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 20. GENERATE QR CODE IMAGE (admin atau staff) dengan pengecekan akses
app.get('/api/items/:id/qrcode', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }
    const qrData = JSON.stringify({ id: item.id, article: item.article, komponen: item.komponen, location: item.kolom, minStock: item.minStock, timestamp: new Date().toISOString(), action: 'scan_update' });
    const qrCodeDataURL = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H', type: 'image/png', margin: 1, scale: 8, color: { dark: '#000000', light: '#FFFFFF' } });
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, "");
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(base64Data, 'base64'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 21. BATCH QR CODE GENERATION (admin atau staff) dengan filter kategori
app.post('/api/qrcode/batch', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ message: 'Item IDs array is required' });

    const where = { id: itemIds };
    addCategoryFilter(req, where);

    const items = await Item.findAll({ where, order: [['kolom', 'ASC'], ['article', 'ASC']] });

    const qrCodes = [];
    for (const item of items) {
      const qrData = JSON.stringify({ id: item.id, article: item.article, komponen: item.komponen, location: item.kolom, timestamp: new Date().toISOString(), action: 'scan_update' });
      const qrCodeDataURL = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H', scale: 6 });
      qrCodes.push({ id: item.id, article: item.article, qrData, qrCodeDataURL, location: item.kolom, qty: item.qty, minStock: item.minStock });
    }
    res.json({ success: true, count: qrCodes.length, qrCodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 22. GET SCAN LOGS (semua role) dengan filter kategori
app.get('/api/scan-logs', isAuthenticated, async (req, res) => {
  try {
    const where = {};
    if (req.query.startDate) where.createdAt = { [Op.gte]: new Date(req.query.startDate) };
    if (req.query.endDate) where.createdAt = { ...where.createdAt, [Op.lte]: new Date(req.query.endDate) };
    if (req.query.action) where.action = req.query.action;

    const itemWhere = {};
    addCategoryFilter(req, itemWhere);

    const logs = await ScanLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100,
      include: [{
        model: Item,
        attributes: ['article', 'komponen', 'kolom', 'categoryId'],
        required: true,
        where: itemWhere
      }]
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 23. INVENTORY COUNT VIA QR (semua role) dengan pengecekan akses
app.post('/api/inventory/count', isAuthenticated, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { scans } = req.body;
    if (!Array.isArray(scans) || scans.length === 0) { await transaction.rollback(); return res.status(400).json({ message: 'Scans array is required' }); }

    const results = []; const discrepancies = [];
    for (const scan of scans) {
      const { qrData, countedQty } = scan;
      let itemId;
      try { const parsedData = JSON.parse(qrData); itemId = parsedData.id; } catch (err) {
        if (!isNaN(qrData)) itemId = parseInt(qrData);
        else if (qrData.match(/ITEM\d+/i) || qrData.match(/WH\d+/i)) itemId = parseInt(qrData.replace(/[^0-9]/g, ''));
      }
      const item = await Item.findByPk(itemId);
      if (!item) { results.push({ qrData, success: false, message: 'Item not found' }); continue; }

      if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
        results.push({ qrData, success: false, message: 'No access to this item' });
        continue;
      }

      if (item.qty !== countedQty) discrepancies.push({ itemId: item.id, article: item.article, systemQty: item.qty, countedQty, difference: countedQty - item.qty });

      await ScanLog.create({
        itemId: item.id,
        article: item.article,
        scanType: 'qr',
        scanData: qrData,
        action: 'check_in',
        result: `Counted: ${countedQty}, System: ${item.qty}`,
        scannedBy: req.session.username
      }, { transaction });

      results.push({ itemId: item.id, article: item.article, systemQty: item.qty, countedQty, success: true });
    }
    await transaction.commit();
    res.json({ success: true, totalScanned: results.length, results, discrepancies, discrepancyCount: discrepancies.length });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 24. GENERATE QR CODE FOR LABELS (admin atau staff) dengan pengecekan akses
app.get('/api/items/:id/label-qrcode', isAuthenticated, isAdminOrStaff, async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (req.session.role !== 'admin' && item.categoryId !== req.session.categoryId) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke item ini' });
    }
    const qrData = JSON.stringify({ id: item.id, article: item.article, location: item.kolom || '' });
    const qrCodeDataURL = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'M', type: 'image/png', margin: 0, scale: 3, color: { dark: '#000000', light: '#FFFFFF' } });
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, "");
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(base64Data, 'base64'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route untuk frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/scanner', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scanner.html')));

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

function determineChangeType(changeAmount, specifiedType) {
  if (specifiedType) return specifiedType;
  if (changeAmount > 0) return 'inbound';
  if (changeAmount < 0) return 'outbound';
  return 'manual';
}

const PORT = process.env.PORT || 2616;
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Warehouse Management System v5.4`);
  console.log(`QR Code otomatis di label: ENABLED`);
  console.log(`Role-based access control: ENABLED (admin/operator/staff) dengan pembatasan kategori`);
  console.log(`Manajemen User: ENABLED (admin only)`);
  console.log(`Manajemen Kategori: ENABLED (admin only)`);
  console.log(`Manajemen Lokasi: ENABLED (admin & staff)`);
  console.log(`Fitur Export: EXCEL (ExcelJS)`);
  console.log(`Fitur Import: EXCEL (admin only)`); // <-- update
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database: ${sequelize.config.storage}`);
  console.log(`Default users: admin/admin , operator/operator , staff/staff`);
  console.log(`========================================`);
});