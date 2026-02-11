// Warehouse Management App (Express.js + SQLite + Sequelize)
// Versi 4.1 dengan fitur QR Code Scanner dan QR otomatis di label

const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(bodyParser.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// DATABASE (SQLite + Sequelize)
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './warehouse.db',
  logging: false
});

// MODEL ITEM
const Item = sequelize.define('Item', {
  article: { type: DataTypes.STRING, allowNull: false },
  komponen: { type: DataTypes.STRING, allowNull: false },
  noPo: { type: DataTypes.STRING },
  order: { type: DataTypes.INTEGER, defaultValue: 0 },
  qty: { type: DataTypes.INTEGER, defaultValue: 0 },
  kolom: { type: DataTypes.STRING },
  minStock: { type: DataTypes.INTEGER, defaultValue: 10 }
}, {
  timestamps: true
});

// MODEL RIWAYAT UPDATE QTY
const QtyHistory = sequelize.define('QtyHistory', {
  itemId: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    references: {
      model: Item,
      key: 'id'
    }
  },
  article: { type: DataTypes.STRING, allowNull: false },
  oldQty: { type: DataTypes.INTEGER, allowNull: false },
  newQty: { type: DataTypes.INTEGER, allowNull: false },
  changeAmount: { type: DataTypes.INTEGER, allowNull: false },
  changeType: { 
    type: DataTypes.ENUM('manual', 'adjustment', 'inbound', 'outbound', 'correction', 'qr_scan'),
    defaultValue: 'manual'
  },
  notes: { type: DataTypes.TEXT },
  updatedBy: { type: DataTypes.STRING, defaultValue: 'System' }
}, {
  timestamps: true,
  indexes: [
    { fields: ['itemId'] },
    { fields: ['createdAt'] }
  ]
});

// MODEL LOKASI/RAK
const Location = sequelize.define('Location', {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  capacity: { type: DataTypes.INTEGER, defaultValue: 100 },
  currentItems: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  timestamps: true
});

// MODEL SCAN LOG
const ScanLog = sequelize.define('ScanLog', {
  itemId: { type: DataTypes.INTEGER, allowNull: false },
  article: { type: DataTypes.STRING },
  scanType: { type: DataTypes.ENUM('qr', 'barcode', 'manual'), defaultValue: 'qr' },
  scanData: { type: DataTypes.TEXT },
  action: { type: DataTypes.ENUM('search', 'update', 'check_in', 'check_out') },
  result: { type: DataTypes.TEXT },
  scannedBy: { type: DataTypes.STRING, defaultValue: 'System' }
}, {
  timestamps: true
});

// Asosiasi
Item.hasMany(QtyHistory, { foreignKey: 'itemId', onDelete: 'CASCADE' });
QtyHistory.belongsTo(Item, { foreignKey: 'itemId' });
Item.belongsTo(Location, { foreignKey: 'locationId' });
Location.hasMany(Item, { foreignKey: 'locationId' });
Item.hasMany(ScanLog, { foreignKey: 'itemId', onDelete: 'CASCADE' });
ScanLog.belongsTo(Item, { foreignKey: 'itemId' });

// Sinkronisasi database
sequelize.sync();

// Helper function untuk menentukan tipe perubahan
function determineChangeType(changeAmount, specifiedType) {
  if (specifiedType) return specifiedType;
  
  if (changeAmount > 0) return 'inbound';
  if (changeAmount < 0) return 'outbound';
  return 'manual';
}

// MIDDLEWARE: Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// === API ROUTES ===

// 1. CREATE ITEM
app.post('/api/items', async (req, res) => {
  try {
    const item = await Item.create(req.body);
    
    // Catat riwayat qty awal
    if (req.body.qty > 0) {
      await QtyHistory.create({
        itemId: item.id,
        article: item.article,
        oldQty: 0,
        newQty: req.body.qty,
        changeAmount: req.body.qty,
        changeType: 'inbound',
        notes: 'Initial stock creation'
      });
    }
    
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. LIST ITEMS dengan berbagai filter
app.get('/api/items', async (req, res) => {
  try {
    const where = {};
    const order = [['updatedAt', 'DESC']];
    
    // Filter by column
    if (req.query.kolom) where.kolom = req.query.kolom;
    
    // Search filter
    if (req.query.search) {
      where[Op.or] = [
        { article: { [Op.like]: `%${req.query.search}%` } },
        { komponen: { [Op.like]: `%${req.query.search}%` } },
        { noPo: { [Op.like]: `%${req.query.search}%` } },
        { kolom: { [Op.like]: `%${req.query.search}%` } }
      ];
    }
    
    // Filter low stock
    if (req.query.lowStock === 'true') {
      where.qty = { [Op.lte]: sequelize.col('minStock') };
    }
    
    // Filter by komponen
    if (req.query.komponen) {
      where.komponen = req.query.komponen;
    }
    
    // Sorting
    if (req.query.sortBy) {
      const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';
      order.unshift([req.query.sortBy, sortOrder]);
    } else {
      order.unshift(['kolom', 'ASC'], ['article', 'ASC']);
    }
    
    // Pagination
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const items = await Item.findAll({ 
      order,
      where,
      limit,
      offset
    });
    
    // Total count for pagination
    const total = await Item.count({ where });
    
    res.json({
      items,
      total,
      limit,
      offset,
      hasMore: (offset + items.length) < total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET SINGLE ITEM
app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. UPDATE ITEM dengan riwayat
app.put('/api/items/:id', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }

    const oldQty = item.qty;
    const newQty = req.body.qty !== undefined ? parseInt(req.body.qty) : oldQty;
    
    // Simpan data lama
    const oldData = {
      article: item.article,
      komponen: item.komponen,
      noPo: item.noPo,
      order: item.order,
      qty: item.qty,
      kolom: item.kolom
    };

    await item.update(req.body, { transaction });

    // Catat perubahan qty jika ada perubahan
    if (req.body.qty !== undefined && oldQty !== newQty) {
      const changeAmount = newQty - oldQty;
      const changeType = determineChangeType(changeAmount, req.body.changeType);
      
      await QtyHistory.create({
        itemId: item.id,
        article: item.article,
        oldQty: oldQty,
        newQty: newQty,
        changeAmount: changeAmount,
        changeType: changeType,
        notes: req.body.changeNotes || `Qty updated from ${oldQty} to ${newQty}`,
        updatedBy: req.body.updatedBy || 'System'
      }, { transaction });
    }

    await transaction.commit();
    res.json(item);
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE ITEM
app.delete('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Catat penghapusan di riwayat
    await QtyHistory.create({
      itemId: item.id,
      article: item.article,
      oldQty: item.qty,
      newQty: 0,
      changeAmount: -item.qty,
      changeType: 'outbound',
      notes: 'Item deleted from system',
      updatedBy: 'System'
    });
    
    await item.destroy();
    res.json({ status: 'deleted', message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. UPDATE QTY dengan detail (endpoint khusus)
app.post('/api/items/:id/update-qty', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }

    const { newQty, changeType, notes, updatedBy, adjustment } = req.body;
    
    if (newQty === undefined && adjustment === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Either newQty or adjustment is required' });
    }

    const oldQty = item.qty;
    let finalQty = newQty !== undefined ? parseInt(newQty) : oldQty + parseInt(adjustment);
    
    // Validasi qty tidak negatif
    if (finalQty < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Quantity cannot be negative' });
    }

    // Update item
    await item.update({ qty: finalQty }, { transaction });

    // Catat riwayat
    const history = await QtyHistory.create({
      itemId: item.id,
      article: item.article,
      oldQty: oldQty,
      newQty: finalQty,
      changeAmount: finalQty - oldQty,
      changeType: changeType || (adjustment !== undefined ? 'adjustment' : 'manual'),
      notes: notes || (adjustment !== undefined 
        ? `Adjusted by ${adjustment > 0 ? '+' : ''}${adjustment}`
        : `Updated from ${oldQty} to ${finalQty}`),
      updatedBy: updatedBy || 'System'
    }, { transaction });

    await transaction.commit();
    
    res.json({
      success: true,
      item: item,
      history: history,
      message: `Qty updated from ${oldQty} to ${finalQty}`
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 7. GET QTY HISTORY untuk item tertentu
app.get('/api/items/:id/qty-history', async (req, res) => {
  try {
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

// 8. GET ALL QTY HISTORY (untuk dashboard)
app.get('/api/qty-history', async (req, res) => {
  try {
    const where = {};
    if (req.query.startDate) {
      where.createdAt = { [Op.gte]: new Date(req.query.startDate) };
    }
    if (req.query.endDate) {
      where.createdAt = { ...where.createdAt, [Op.lte]: new Date(req.query.endDate) };
    }
    if (req.query.changeType) {
      where.changeType = req.query.changeType;
    }
    
    const history = await QtyHistory.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100,
      include: [{ 
        model: Item, 
        attributes: ['article', 'komponen', 'kolom'],
        required: true
      }]
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET DASHBOARD STATS
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const totalItems = await Item.count();
    const totalQty = await Item.sum('qty');
    const totalOrder = await Item.sum('order');
    const lowStockItems = await Item.count({
      where: {
        qty: { [Op.lte]: sequelize.col('minStock') }
      }
    });
    
    // Items per location
    const itemsByLocation = await Item.findAll({
      attributes: [
        'kolom',
        [sequelize.fn('COUNT', sequelize.col('id')), 'itemCount'],
        [sequelize.fn('SUM', sequelize.col('qty')), 'totalQty']
      ],
      group: ['kolom'],
      having: sequelize.where(sequelize.col('kolom'), { [Op.not]: null }),
      order: [[sequelize.col('itemCount'), 'DESC']]
    });
    
    // Recent activities
    const recentActivities = await QtyHistory.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10,
      include: [{ 
        model: Item, 
        attributes: ['article', 'komponen']
      }]
    });
    
    // Recent scans
    const recentScans = await ScanLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [{ 
        model: Item,
        attributes: ['article', 'komponen', 'kolom']
      }]
    });
    
    res.json({
      totalItems,
      totalQty,
      totalOrder,
      lowStockItems,
      itemsByLocation,
      recentActivities,
      recentScans
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET UNIQUE VALUES (untuk filter dropdowns)
app.get('/api/unique-values', async (req, res) => {
  try {
    const komponen = await Item.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('komponen')), 'komponen']],
      where: { komponen: { [Op.not]: null } }
    });
    
    const kolom = await Item.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('kolom')), 'kolom']],
      where: { kolom: { [Op.not]: null } },
      order: [['kolom', 'ASC']]
    });
    
    res.json({
      komponen: komponen.map(k => k.komponen),
      kolom: kolom.map(k => k.kolom)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. BULK OPERATIONS
app.post('/api/items/bulk/update-qty', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { items, changeType, notes, updatedBy } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Items array is required' });
    }
    
    const results = [];
    
    for (const itemData of items) {
      const { id, adjustment, newQty } = itemData;
      
      const item = await Item.findByPk(id);
      if (!item) continue;
      
      const oldQty = item.qty;
      let finalQty = newQty !== undefined ? parseInt(newQty) : oldQty + parseInt(adjustment);
      
      if (finalQty < 0) continue;
      
      await item.update({ qty: finalQty }, { transaction });
      
      const history = await QtyHistory.create({
        itemId: item.id,
        article: item.article,
        oldQty: oldQty,
        newQty: finalQty,
        changeAmount: finalQty - oldQty,
        changeType: changeType || 'adjustment',
        notes: notes || `Bulk update: ${adjustment ? `Adjusted by ${adjustment}` : `Set to ${newQty}`}`,
        updatedBy: updatedBy || 'System'
      }, { transaction });
      
      results.push({
        id: item.id,
        article: item.article,
        oldQty,
        newQty: finalQty,
        success: true
      });
    }
    
    await transaction.commit();
    res.json({
      success: true,
      updatedCount: results.length,
      results
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 12. EXPORT DATA TO CSV
app.get('/api/export/csv', async (req, res) => {
  try {
    const items = await Item.findAll({
      order: [['kolom', 'ASC'], ['article', 'ASC']]
    });
    
    const csvHeader = 'ID,Article,Komponen,No PO,Order,Qty,Min Stock,Lokasi,Created At,Updated At\n';
    const csvRows = items.map(item => 
      `${item.id},"${item.article}","${item.komponen}","${item.noPo || ''}",${item.order},${item.qty},${item.minStock},"${item.kolom || ''}","${item.createdAt}","${item.updatedAt}"`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=warehouse-export-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. IMPORT DATA FROM CSV
app.post('/api/import/csv', express.text({ type: 'text/csv' }), async (req, res) => {
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
      
      const item = await Item.create(itemData);
      importedItems.push(item);
    }
    
    res.json({
      success: true,
      message: `Imported ${importedItems.length} items`,
      items: importedItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. BACKUP DATABASE
app.get('/api/backup', async (req, res) => {
  try {
    // Create backup file
    const backupData = await Item.findAll();
    const backupDate = new Date().toISOString().replace(/[:.]/g, '-');
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=warehouse-backup-${backupDate}.json`);
    res.json({
      timestamp: new Date(),
      itemCount: backupData.length,
      items: backupData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. LOCATION MANAGEMENT
app.get('/api/locations', async (req, res) => {
  try {
    const locations = await Location.findAll({
      include: [{
        model: Item,
        attributes: ['id', 'article', 'qty']
      }],
      order: [['name', 'ASC']]
    });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', async (req, res) => {
  try {
    const location = await Location.create(req.body);
    res.json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. GENERATE LABEL DATA
app.get('/api/items/:id/label-data', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Generate QR Code
    const qrData = JSON.stringify({
      id: item.id,
      article: item.article,
      komponen: item.komponen,
      location: item.kolom,
      minStock: item.minStock,
      timestamp: new Date().toISOString(),
      action: 'scan_update'
    });
    
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      scale: 6,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // Generate label data
    const labelData = {
      id: item.id,
      article: item.article,
      komponen: item.komponen,
      noPo: item.noPo,
      qty: item.qty,
      minStock: item.minStock,
      kolom: item.kolom,
      createdAt: item.createdAt,
      barcodeData: `ITEM${item.id.toString().padStart(6, '0')}`,
      qrData: qrData,
      qrCodeDataURL: qrCodeDataURL
    };
    
    res.json(labelData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17. GENERATE BULK LABELS (FIXED)
app.post('/api/labels/bulk', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Item IDs array is required' });
    }
    
    const items = await Item.findAll({
      where: { id: itemIds },
      order: [['kolom', 'ASC'], ['article', 'ASC']]
    });
    
    // Generate QR codes for each item
    const labels = [];
    for (const item of items) {
      const qrData = JSON.stringify({
        id: item.id,
        article: item.article,
        komponen: item.komponen,
        location: item.kolom,
        qty: item.qty,
        minStock: item.minStock,
        timestamp: new Date().toISOString(),
        action: 'scan_update'
      });
      
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 1,
        scale: 6,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      labels.push({
        id: item.id,
        article: item.article,
        komponen: item.komponen,
        qty: item.qty,
        kolom: item.kolom,
        minStock: item.minStock,
        noPo: item.noPo || '',
        barcode: `WH${item.id.toString().padStart(6, '0')}`,
        qrData: qrData,
        qrCodeDataURL: qrCodeDataURL,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      count: labels.length,
      labels: labels
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 18. QR CODE SCAN & SEARCH
app.post('/api/qr-scan', async (req, res) => {
  try {
    const { qrData, type = 'auto' } = req.body;
    
    if (!qrData) {
      return res.status(400).json({ message: 'QR data is required' });
    }
    
    let where = {};
    
    // Parse QR data berdasarkan tipe
    if (type === 'full' || type === 'auto') {
      try {
        // Coba parse sebagai JSON
        const parsedData = JSON.parse(qrData);
        if (parsedData.id) {
          where.id = parsedData.id;
        } else if (parsedData.article) {
          where.article = { [Op.like]: `%${parsedData.article}%` };
        }
      } catch (err) {
        // Jika bukan JSON, cari berdasarkan pattern
        if (!isNaN(qrData)) {
          // Numeric ID
          where.id = parseInt(qrData);
        } else if (qrData.match(/ITEM\d+/i) || qrData.match(/WH\d+/i)) {
          // Format "ITEM123" atau "WH123"
          const itemId = parseInt(qrData.replace(/[^0-9]/g, ''));
          where.id = itemId;
        } else {
          // Search by article or komponen
          where[Op.or] = [
            { article: { [Op.like]: `%${qrData}%` } },
            { komponen: { [Op.like]: `%${qrData}%` } },
            { kolom: { [Op.like]: `%${qrData}%` } }
          ];
        }
      }
    } else if (type === 'id') {
      // QR berisi ID item saja
      if (!isNaN(qrData)) {
        where.id = parseInt(qrData);
      } else {
        const itemId = qrData.replace(/[^0-9]/g, '');
        if (itemId) {
          where.id = parseInt(itemId);
        }
      }
    } else if (type === 'article') {
      where.article = { [Op.like]: `%${qrData}%` };
    }
    
    const items = await Item.findAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit: 10
    });
    
    // Log the scan
    if (items.length > 0) {
      await ScanLog.create({
        itemId: items[0].id,
        article: items[0].article,
        scanType: 'qr',
        scanData: qrData,
        action: 'search',
        result: `Found ${items.length} items`,
        scannedBy: req.body.scannedBy || 'System'
      });
    }
    
    if (items.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Item tidak ditemukan',
        qrData,
        type
      });
    }
    
    res.json({
      success: true,
      count: items.length,
      items,
      qrData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 19. QUICK UPDATE VIA QR
app.post('/api/qr-quick-update', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { qrData, adjustment, newQty, changeType, notes, updatedBy } = req.body;
    
    if (!qrData) {
      await transaction.rollback();
      return res.status(400).json({ message: 'QR data is required' });
    }
    
    if (adjustment === undefined && newQty === undefined) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Either adjustment or newQty is required' });
    }
    
    // Parse QR untuk mendapatkan ID item
    let itemId;
    let item;
    
    // Try to parse as JSON first
    try {
      const parsedData = JSON.parse(qrData);
      if (parsedData.id) {
        itemId = parsedData.id;
      }
    } catch (err) {
      // Not JSON, try other formats
      if (!isNaN(qrData)) {
        itemId = parseInt(qrData);
      } else if (qrData.match(/ITEM\d+/i) || qrData.match(/WH\d+/i)) {
        itemId = parseInt(qrData.replace(/[^0-9]/g, ''));
      } else {
        // Search by article
        item = await Item.findOne({
          where: { article: { [Op.like]: `%${qrData}%` } }
        });
        if (item) {
          itemId = item.id;
        }
      }
    }
    
    if (!item) {
      item = await Item.findByPk(itemId);
    }
    
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item tidak ditemukan' });
    }
    
    const oldQty = item.qty;
    let finalQty;
    
    if (newQty !== undefined) {
      finalQty = parseInt(newQty);
    } else {
      finalQty = oldQty + parseInt(adjustment);
    }
    
    if (finalQty < 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Quantity cannot be negative' });
    }
    
    await item.update({ qty: finalQty }, { transaction });
    
    const history = await QtyHistory.create({
      itemId: item.id,
      article: item.article,
      oldQty: oldQty,
      newQty: finalQty,
      changeAmount: finalQty - oldQty,
      changeType: changeType || (adjustment > 0 ? 'inbound' : adjustment < 0 ? 'outbound' : 'qr_scan'),
      notes: notes || `QR Scan Update: ${newQty !== undefined ? `Set to ${newQty}` : `Adjusted by ${adjustment > 0 ? '+' : ''}${adjustment}`}`,
      updatedBy: updatedBy || 'QR Scanner'
    }, { transaction });
    
    // Log the scan update
    await ScanLog.create({
      itemId: item.id,
      article: item.article,
      scanType: 'qr',
      scanData: qrData,
      action: 'update',
      result: `Qty updated: ${oldQty} → ${finalQty}`,
      scannedBy: updatedBy || 'QR Scanner'
    }, { transaction });
    
    await transaction.commit();
    
    res.json({
      success: true,
      item: item,
      history: history,
      message: `Qty updated via QR: ${oldQty} → ${finalQty} (${finalQty - oldQty > 0 ? '+' : ''}${finalQty - oldQty})`
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 20. GENERATE QR CODE IMAGE
app.get('/api/items/:id/qrcode', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Data untuk QR Code
    const qrData = JSON.stringify({
      id: item.id,
      article: item.article,
      komponen: item.komponen,
      location: item.kolom,
      minStock: item.minStock,
      timestamp: new Date().toISOString(),
      action: 'scan_update'
    });
    
    // Generate QR Code sebagai PNG
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      scale: 8,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // Potong prefix data URL
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, "");
    
    // Set response sebagai image PNG
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(base64Data, 'base64'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 21. BATCH QR CODE GENERATION
app.post('/api/qrcode/batch', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Item IDs array is required' });
    }
    
    const items = await Item.findAll({
      where: { id: itemIds },
      order: [['kolom', 'ASC'], ['article', 'ASC']]
    });
    
    const qrCodes = [];
    
    for (const item of items) {
      const qrData = JSON.stringify({
        id: item.id,
        article: item.article,
        komponen: item.komponen,
        location: item.kolom,
        timestamp: new Date().toISOString(),
        action: 'scan_update'
      });
      
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        scale: 6
      });
      
      qrCodes.push({
        id: item.id,
        article: item.article,
        qrData: qrData,
        qrCodeDataURL: qrCodeDataURL,
        location: item.kolom,
        qty: item.qty,
        minStock: item.minStock
      });
    }
    
    res.json({
      success: true,
      count: qrCodes.length,
      qrCodes: qrCodes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 22. GET SCAN LOGS
app.get('/api/scan-logs', async (req, res) => {
  try {
    const where = {};
    
    if (req.query.startDate) {
      where.createdAt = { [Op.gte]: new Date(req.query.startDate) };
    }
    if (req.query.endDate) {
      where.createdAt = { ...where.createdAt, [Op.lte]: new Date(req.query.endDate) };
    }
    if (req.query.action) {
      where.action = req.query.action;
    }
    
    const logs = await ScanLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100,
      include: [{
        model: Item,
        attributes: ['article', 'komponen', 'kolom']
      }]
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 23. INVENTORY COUNT VIA QR
app.post('/api/inventory/count', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { scans } = req.body; // Array of { qrData, countedQty }
    
    if (!Array.isArray(scans) || scans.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Scans array is required' });
    }
    
    const results = [];
    const discrepancies = [];
    
    for (const scan of scans) {
      const { qrData, countedQty } = scan;
      
      // Parse QR data to find item
      let itemId;
      try {
        const parsedData = JSON.parse(qrData);
        itemId = parsedData.id;
      } catch (err) {
        if (!isNaN(qrData)) {
          itemId = parseInt(qrData);
        } else if (qrData.match(/ITEM\d+/i) || qrData.match(/WH\d+/i)) {
          itemId = parseInt(qrData.replace(/[^0-9]/g, ''));
        }
      }
      
      const item = await Item.findByPk(itemId);
      if (!item) {
        results.push({ qrData, success: false, message: 'Item not found' });
        continue;
      }
      
      // Check for discrepancy
      if (item.qty !== countedQty) {
        discrepancies.push({
          itemId: item.id,
          article: item.article,
          systemQty: item.qty,
          countedQty: countedQty,
          difference: countedQty - item.qty
        });
      }
      
      // Log the count
      await ScanLog.create({
        itemId: item.id,
        article: item.article,
        scanType: 'qr',
        scanData: qrData,
        action: 'check_in',
        result: `Counted: ${countedQty}, System: ${item.qty}`,
        scannedBy: req.body.scannedBy || 'Inventory Counter'
      }, { transaction });
      
      results.push({
        itemId: item.id,
        article: item.article,
        systemQty: item.qty,
        countedQty: countedQty,
        success: true
      });
    }
    
    await transaction.commit();
    
    res.json({
      success: true,
      totalScanned: results.length,
      results: results,
      discrepancies: discrepancies,
      discrepancyCount: discrepancies.length
    });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// 24. GENERATE QR CODE FOR LABELS (NEW - untuk label)
app.get('/api/items/:id/label-qrcode', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Data minimal untuk QR Code di label
    const qrData = JSON.stringify({
      id: item.id,
      article: item.article,
      location: item.kolom || ''
    });
    
    // Generate QR Code sebagai PNG dengan settings untuk label
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 0, // No margin untuk label
      scale: 3, // Lebih kecil untuk label
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // Potong prefix data URL
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, "");
    
    // Set response sebagai image PNG
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(base64Data, 'base64'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route untuk frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/scanner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Warehouse Management System v4.1`);
  console.log(`QR Code otomatis di label: ENABLED`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Database: ${sequelize.config.storage}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`========================================`);
});