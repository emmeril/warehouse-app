     function warehouseApp() {
            return {
                // State
                items: [],
                currentItem: {
                    id: null,
                    article: '',
                    komponen: '',
                    noPo: '',
                    order: 0,
                    qty: 0,
                    minStock: 10,
                    kolom: ''
                },
                filter: {
                    kolom: '',
                    komponen: '',
                    search: ''
                },
                loading: false,
                error: '',
                showNotification: false,
                notificationMessage: '',
                notificationType: 'success',
                showLowStock: false,
                
                // State untuk fitur detail qty
                showQtyDetailModal: false,
                showQtyHistoryModal: false,
                showBulkUpdateModal: false,
                selectedItemForQtyUpdate: null,
                selectedItemForHistory: null,
                qtyUpdateDetail: {
                    method: 'adjust',
                    newQty: 0,
                    adjustment: 0,
                    changeType: 'adjustment',
                    notes: '',
                    updatedBy: ''
                },
                bulkUpdateData: {
                    adjustment: 0,
                    notes: ''
                },
                selectedItemsForBulk: [],
                qtyHistory: [],
                recentActivities: [],
                recentScans: [],
                historyFilter: {
                    changeType: '',
                    limit: '10',
                    startDate: ''
                },
                stats: {},
                
                // State untuk table
                tableSearch: '',
                sortField: 'id',
                sortDirection: 'asc',
                currentPage: 1,
                itemsPerPage: 20,
                
                // Loading states
                savingItem: false,
                qtyUpdateLoading: false,
                qtyHistoryLoading: false,
                bulkUpdateLoading: false,
                
                // State untuk fitur label
                showLabelModal: false,
                showBulkLabelModal: false,
                selectedItemForLabel: null,
                selectedItemsForBulkLabel: [],
                labelCopies: 1,
                labelSize: 'medium',
                labelShowQR: true,
                labelShowBarcode: true,
                bulkLabelCopies: 1,
                bulkLabelFormat: 'standard',
                bulkLabelSize: 'medium',
                
                // State untuk QR Code Scanner
                showQRScanModal: false,
                qrScanMode: 'camera',
                qrManualInput: '',
                qrType: 'auto',
                qrUploadedImage: null,
                scannedItem: null,
                scannedItems: [],
                qrCustomAdjustment: 0,
                qrSetToValue: '',
                cameraScanning: false,
                cameraAvailable: true,
                videoStream: null,
                lastScanTime: null,
                
                // State untuk QR Stats
                todayScanCount: 0,
                showScanLogs: false,
                
                // Computed Properties
                get filteredItems() {
                    let filtered = this.items;
                    
                    // Filter low stock
                    if (this.showLowStock) {
                        filtered = filtered.filter(item => item.qty <= item.minStock);
                    }
                    
                    // Filter by table search
                    if (this.tableSearch) {
                        const search = this.tableSearch.toLowerCase();
                        filtered = filtered.filter(item => 
                            item.article.toLowerCase().includes(search) ||
                            item.komponen.toLowerCase().includes(search) ||
                            (item.noPo && item.noPo.toLowerCase().includes(search)) ||
                            (item.kolom && item.kolom.toLowerCase().includes(search))
                        );
                    }
                    
                    return filtered;
                },
                
                get filteredAndSortedItems() {
                    let items = this.filteredItems;
                    
                    // Sorting
                    items.sort((a, b) => {
                        let aValue = a[this.sortField];
                        let bValue = b[this.sortField];
                        
                        if (this.sortField === 'article' || this.sortField === 'komponen' || this.sortField === 'kolom') {
                            aValue = aValue || '';
                            bValue = bValue || '';
                        }
                        
                        if (aValue < bValue) return this.sortDirection === 'asc' ? -1 : 1;
                        if (aValue > bValue) return this.sortDirection === 'asc' ? 1 : -1;
                        return 0;
                    });
                    
                    // Pagination
                    const start = (this.currentPage - 1) * this.itemsPerPage;
                    const end = start + this.itemsPerPage;
                    return items.slice(start, end);
                },
                
                get totalQty() {
                    return this.items.reduce((sum, item) => sum + parseInt(item.qty || 0), 0);
                },
                
                get totalOrder() {
                    return this.items.reduce((sum, item) => sum + parseInt(item.order || 0), 0);
                },
                
                get uniqueLocations() {
                    const locations = this.items.map(item => item.kolom).filter(Boolean);
                    return [...new Set(locations)].length;
                },
                
                get uniqueLocationsList() {
                    const locations = this.items.map(item => item.kolom).filter(Boolean);
                    return [...new Set(locations)].sort();
                },
                
                get uniqueKomponenList() {
                    const komponen = this.items.map(item => item.komponen).filter(Boolean);
                    return [...new Set(komponen)].sort();
                },
                
                get lowStockCount() {
                    return this.items.filter(item => item.qty <= item.minStock).length;
                },
                
                get safeStockCount() {
                    return this.items.filter(item => item.qty > item.minStock).length;
                },
                
                get itemsWithNoPo() {
                    return this.items.filter(item => item.noPo && item.noPo.trim() !== '').length;
                },
                
                get filterActive() {
                    return this.filter.kolom || this.filter.komponen || this.filter.search || this.showLowStock;
                },
                
                // Methods
                async init() {
                    await Promise.all([
                        this.loadItems(),
                        this.loadStats(),
                        this.loadRecentActivities(),
                        this.loadScanLogs(),
                        this.loadUniqueValues()
                    ]);
                    
                    // Auto-refresh setiap 60 detik
                    setInterval(() => {
                        this.loadItems();
                        this.loadStats();
                    }, 60000);
                    
                    // Check camera availability
                    this.checkCameraAvailability();
                },
                
                async loadItems() {
                    this.loading = true;
                    this.error = '';
                    
                    try {
                        let url = '/api/items';
                        const params = [];
                        
                        if (this.filter.kolom) params.push(`kolom=${encodeURIComponent(this.filter.kolom)}`);
                        if (this.filter.komponen) params.push(`komponen=${encodeURIComponent(this.filter.komponen)}`);
                        if (this.filter.search) params.push(`search=${encodeURIComponent(this.filter.search)}`);
                        
                        if (params.length > 0) url += '?' + params.join('&');
                        
                        const response = await fetch(url);
                        if (!response.ok) throw new Error('Gagal memuat data dari server');
                        
                        const data = await response.json();
                        this.items = Array.isArray(data) ? data : data.items || [];
                    } catch (err) {
                        this.error = err.message;
                        this.showNotificationMessage('Gagal memuat data: ' + err.message, 'error');
                    } finally {
                        this.loading = false;
                    }
                },
                
                async loadStats() {
                    try {
                        const response = await fetch('/api/dashboard/stats');
                        if (response.ok) {
                            this.stats = await response.json();
                            // Calculate today's scan count
                            const today = new Date().toDateString();
                            this.todayScanCount = this.recentScans.filter(scan => 
                                new Date(scan.createdAt).toDateString() === today
                            ).length;
                        }
                    } catch (err) {
                        console.error('Failed to load stats:', err);
                    }
                },
                
                async loadRecentActivities() {
                    try {
                        const response = await fetch('/api/qty-history?limit=5');
                        if (response.ok) {
                            this.recentActivities = await response.json();
                        }
                    } catch (err) {
                        console.error('Failed to load recent activities:', err);
                    }
                },
                
                async loadScanLogs() {
                    try {
                        const response = await fetch('/api/scan-logs?limit=10');
                        if (response.ok) {
                            this.recentScans = await response.json();
                        }
                    } catch (err) {
                        console.error('Failed to load scan logs:', err);
                    }
                },
                
                async loadUniqueValues() {
                    try {
                        const response = await fetch('/api/unique-values');
                        if (response.ok) {
                            // Values are already loaded from items
                        }
                    } catch (err) {
                        console.error('Failed to load unique values:', err);
                    }
                },
                
                // QR Code Scanner Methods
                openQRScanModal() {
                    this.showQRScanModal = true;
                    this.scannedItem = null;
                    this.scannedItems = [];
                    this.qrManualInput = '';
                    this.qrUploadedImage = null;
                    this.qrCustomAdjustment = 0;
                    this.qrSetToValue = '';
                },
                
                closeQRScanModal() {
                    this.showQRScanModal = false;
                    this.stopCameraScan();
                },
                
                async checkCameraAvailability() {
                    try {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const hasCamera = devices.some(device => device.kind === 'videoinput');
                        this.cameraAvailable = hasCamera;
                    } catch (err) {
                        this.cameraAvailable = false;
                    }
                },
                
                async startCameraScan() {
                    try {
                        if (!this.cameraAvailable) {
                            this.showNotificationMessage('Kamera tidak tersedia', 'error');
                            return;
                        }
                        
                        this.cameraScanning = true;
                        
                        // Dapatkan stream dari kamera
                        const stream = await navigator.mediaDevices.getUserMedia({
                            video: { 
                                facingMode: 'environment',
                                width: { ideal: 1280 },
                                height: { ideal: 720 }
                            },
                            audio: false
                        });
                        
                        this.videoStream = stream;
                        const video = document.getElementById('qr-video');
                        video.srcObject = stream;
                        video.setAttribute('playsinline', true);
                        
                        await video.play();
                        
                        // Mulai scanning loop
                        this.scanQRFromCamera();
                        
                    } catch (err) {
                        this.cameraScanning = false;
                        this.showNotificationMessage('Tidak dapat mengakses kamera: ' + err.message, 'error');
                    }
                },
                
                stopCameraScan() {
                    if (this.videoStream) {
                        this.videoStream.getTracks().forEach(track => track.stop());
                        this.videoStream = null;
                    }
                    this.cameraScanning = false;
                    
                    const video = document.getElementById('qr-video');
                    if (video) {
                        video.srcObject = null;
                    }
                },
                
                scanQRFromCamera() {
                    if (!this.cameraScanning) return;
                    
                    const video = document.getElementById('qr-video');
                    const canvas = document.getElementById('qr-canvas');
                    
                    if (video.readyState === video.HAVE_ENOUGH_DATA) {
                        canvas.height = video.videoHeight;
                        canvas.width = video.videoWidth;
                        
                        const context = canvas.getContext('2d');
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        
                        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                        
                        // Use jsQR library for decoding
                        const code = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: 'dontInvert',
                        });
                        
                        if (code) {
                            this.processQRCode(code.data);
                            this.stopCameraScan();
                        }
                    }
                    
                    if (this.cameraScanning) {
                        requestAnimationFrame(() => this.scanQRFromCamera());
                    }
                },
                
                handleQRFileUpload(event) {
                    const file = event.target.files[0];
                    if (!file) return;
                    
                    // Validate file size (max 5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        this.showNotificationMessage('File terlalu besar (maks 5MB)', 'error');
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        this.qrUploadedImage = e.target.result;
                    };
                    reader.readAsDataURL(file);
                },
                
                async scanUploadedQR() {
                    if (!this.qrUploadedImage) {
                        this.showNotificationMessage('Silakan upload gambar terlebih dahulu', 'error');
                        return;
                    }
                    
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        context.drawImage(img, 0, 0);
                        
                        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                        
                        const code = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: 'dontInvert',
                        });
                        
                        if (code) {
                            this.processQRCode(code.data);
                            this.showNotificationMessage('QR Code berhasil dipindai', 'success');
                        } else {
                            this.showNotificationMessage('Tidak dapat membaca QR Code dari gambar', 'error');
                        }
                    };
                    img.src = this.qrUploadedImage;
                },
                
                async processQRCode(qrData) {
                    if (!qrData || !qrData.trim()) {
                        this.showNotificationMessage('QR Code data kosong', 'error');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/qr-scan', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                qrData: qrData.trim(),
                                type: this.qrType,
                                scannedBy: 'Web Scanner'
                            })
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.message || 'Gagal memproses QR Code');
                        }
                        
                        const result = await response.json();
                        this.lastScanTime = new Date().toISOString();
                        
                        if (result.success && result.items && result.items.length > 0) {
                            this.scannedItems = result.items;
                            this.scannedItem = result.items[0];
                            
                            // Load recent scans
                            await this.loadScanLogs();
                            
                            this.showNotificationMessage(`Item ditemukan: ${this.scannedItem.article}`, 'success');
                        } else {
                            this.showNotificationMessage('Item tidak ditemukan', 'error');
                        }
                        
                    } catch (err) {
                        this.showNotificationMessage('Error: ' + err.message, 'error');
                    }
                },
                
                selectScannedItem(item) {
                    this.scannedItem = item;
                },
                
                async qrQuickUpdate(adjustment) {
                    if (!this.scannedItem || !adjustment) return;
                    
                    try {
                        const response = await fetch('/api/qr-quick-update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                qrData: this.scannedItem.id.toString(),
                                adjustment: parseInt(adjustment),
                                changeType: adjustment > 0 ? 'inbound' : 'outbound',
                                notes: `QR Quick Update: ${adjustment > 0 ? '+' : ''}${adjustment}`,
                                updatedBy: 'QR Scanner'
                            })
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.message || 'Gagal update stok');
                        }
                        
                        const result = await response.json();
                        
                        // Update local data
                        await this.loadItems();
                        await this.loadRecentActivities();
                        await this.loadScanLogs();
                        
                        // Update scanned item dengan data baru
                        this.scannedItem.qty = result.item.qty;
                        
                        this.showNotificationMessage(
                            `Stok diperbarui: ${result.item.article} (${result.message})`,
                            'success'
                        );
                        
                    } catch (err) {
                        this.showNotificationMessage('Gagal update stok: ' + err.message, 'error');
                    }
                },
                
                async qrSetToSpecific() {
                    if (!this.scannedItem || !this.qrSetToValue) return;
                    
                    const newQty = parseInt(this.qrSetToValue);
                    if (newQty < 0) {
                        this.showNotificationMessage('Quantity tidak boleh negatif', 'error');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/qr-quick-update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                qrData: this.scannedItem.id.toString(),
                                newQty: newQty,
                                changeType: 'manual',
                                notes: `QR Set Value: ${newQty}`,
                                updatedBy: 'QR Scanner'
                            })
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.message || 'Gagal set stok');
                        }
                        
                        const result = await response.json();
                        
                        // Update local data
                        await this.loadItems();
                        await this.loadRecentActivities();
                        await this.loadScanLogs();
                        
                        // Update scanned item dengan data baru
                        this.scannedItem.qty = result.item.qty;
                        this.qrSetToValue = '';
                        
                        this.showNotificationMessage(
                            `Stok diset ke: ${newQty} untuk ${result.item.article}`,
                            'success'
                        );
                        
                    } catch (err) {
                        this.showNotificationMessage('Gagal set stok: ' + err.message, 'error');
                    }
                },
                
                openQRDetailUpdate() {
                    if (this.scannedItem) {
                        this.openQtyDetailModal(this.scannedItem);
                        this.closeQRScanModal();
                    }
                },
                
                // Existing methods
                async saveItem() {
                    // Validasi
                    if (!this.currentItem.article.trim() || !this.currentItem.komponen.trim()) {
                        this.showNotificationMessage('Article dan Komponen harus diisi', 'error');
                        return;
                    }
                    
                    if (this.currentItem.qty < 0) {
                        this.showNotificationMessage('Quantity tidak boleh negatif', 'error');
                        return;
                    }
                    
                    this.savingItem = true;
                    
                    try {
                        let url = '/api/items';
                        let method = 'POST';
                        
                        if (this.currentItem.id) {
                            url = `/api/items/${this.currentItem.id}`;
                            method = 'PUT';
                        }
                        
                        const response = await fetch(url, {
                            method,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(this.currentItem)
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.message || 'Gagal menyimpan data');
                        }
                        
                        await this.loadItems();
                        this.resetForm();
                        
                        this.showNotificationMessage(
                            this.currentItem.id ? 'Item berhasil diperbarui' : 'Item baru berhasil ditambahkan',
                            'success'
                        );
                        
                    } catch (err) {
                        this.showNotificationMessage('Gagal menyimpan data: ' + err.message, 'error');
                    } finally {
                        this.savingItem = false;
                    }
                },
                
                editItem(item) {
                    this.currentItem = { ...item };
                    // Scroll to form
                    document.querySelector('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
                    
                    this.showNotificationMessage('Mengedit item: ' + item.article, 'info');
                },
                
                duplicateItem(item) {
                    this.currentItem = {
                        id: null,
                        article: item.article + ' (Copy)',
                        komponen: item.komponen,
                        noPo: item.noPo,
                        order: item.order,
                        qty: item.qty,
                        minStock: item.minStock,
                        kolom: item.kolom
                    };
                    
                    document.querySelector('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
                    this.showNotificationMessage('Item siap untuk diduplikat', 'info');
                },
                
                async deleteItem(id) {
                    const item = this.items.find(item => item.id == id);
                    if (!item) return;
                    
                    if (!confirm(`Apakah Anda yakin ingin menghapus item "${item.article}"?`)) return;
                    
                    try {
                        const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.message || 'Gagal menghapus data');
                        }
                        
                        await this.loadItems();
                        this.showNotificationMessage('Item berhasil dihapus', 'success');
                        
                    } catch (err) {
                        this.showNotificationMessage('Gagal menghapus data: ' + err.message, 'error');
                    }
                },
                
                // Methods untuk detail update qty
                openQtyDetailModal(item) {
                    this.selectedItemForQtyUpdate = { ...item };
                    this.qtyUpdateDetail = {
                        method: 'adjust',
                        newQty: item.qty,
                        adjustment: 0,
                        changeType: 'adjustment',
                        notes: '',
                        updatedBy: ''
                    };
                    this.showQtyDetailModal = true;
                },
                
                async submitQtyDetailUpdate() {
                    if (!this.selectedItemForQtyUpdate) return;
                    
                    this.qtyUpdateLoading = true;
                    
                    try {
                        const payload = {
                            changeType: this.qtyUpdateDetail.changeType || 'adjustment',
                            notes: this.qtyUpdateDetail.notes || 'Qty updated',
                            updatedBy: this.qtyUpdateDetail.updatedBy || 'User'
                        };
                        
                        if (this.qtyUpdateDetail.method === 'adjust') {
                            const adjustment = parseInt(this.qtyUpdateDetail.adjustment || 0);
                            if (adjustment === 0) {
                                throw new Error('Adjustment tidak boleh 0');
                            }
                            payload.adjustment = adjustment;
                            // Auto-determine change type based on adjustment
                            if (!payload.changeType) {
                                payload.changeType = adjustment > 0 ? 'inbound' : 'outbound';
                            }
                        } else {
                            const newQty = parseInt(this.qtyUpdateDetail.newQty || 0);
                            if (newQty < 0) {
                                throw new Error('Qty tidak boleh negatif');
                            }
                            payload.newQty = newQty;
                        }
                        
                        const response = await fetch(`/api/items/${this.selectedItemForQtyUpdate.id}/update-qty`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.message || 'Gagal mengupdate qty');
                        }
                        
                        const result = await response.json();
                        
                        // Update item di local state
                        const index = this.items.findIndex(item => item.id === this.selectedItemForQtyUpdate.id);
                        if (index !== -1) {
                            this.items[index].qty = result.item.qty;
                        }
                        
                        // Refresh recent activities
                        await this.loadRecentActivities();
                        
                        // Reset dan tutup modal
                        this.showQtyDetailModal = false;
                        this.qtyUpdateLoading = false;
                        
                        this.showNotificationMessage(result.message, 'success');
                        
                    } catch (err) {
                        this.qtyUpdateLoading = false;
                        this.showNotificationMessage('Gagal mengupdate qty: ' + err.message, 'error');
                    }
                },
                
                async openQtyHistoryModal(item) {
                    this.selectedItemForHistory = { ...item };
                    this.showQtyHistoryModal = true;
                    await this.loadQtyHistory();
                },
                
                async loadQtyHistory() {
                    if (!this.selectedItemForHistory) return;
                    
                    this.qtyHistoryLoading = true;
                    
                    try {
                        let url = `/api/items/${this.selectedItemForHistory.id}/qty-history`;
                        if (this.historyFilter.limit) {
                            url += `?limit=${this.historyFilter.limit}`;
                        }
                        
                        const response = await fetch(url);
                        if (!response.ok) throw new Error('Gagal memuat riwayat');
                        
                        let history = await response.json();
                        
                        // Filter by changeType jika dipilih
                        if (this.historyFilter.changeType) {
                            history = history.filter(h => h.changeType === this.historyFilter.changeType);
                        }
                        
                        // Filter by date jika dipilih
                        if (this.historyFilter.startDate) {
                            const startDate = new Date(this.historyFilter.startDate);
                            history = history.filter(h => new Date(h.createdAt) >= startDate);
                        }
                        
                        this.qtyHistory = history;
                    } catch (err) {
                        this.showNotificationMessage('Gagal memuat riwayat: ' + err.message, 'error');
                    } finally {
                        this.qtyHistoryLoading = false;
                    }
                },
                
                getHistoryCountByType(type) {
                    return this.qtyHistory.filter(h => h.changeType === type).length;
                },
                
                async exportQtyHistory() {
                    if (!this.selectedItemForHistory || this.qtyHistory.length === 0) {
                        this.showNotificationMessage('Tidak ada data riwayat untuk diexport', 'error');
                        return;
                    }
                    
                    const headers = ['Tanggal', 'Article', 'Qty Lama', 'Qty Baru', 'Perubahan', 'Tipe', 'Catatan', 'Oleh'];
                    const csvData = [
                        headers.join(','),
                        ...this.qtyHistory.map(history => [
                            this.formatDateTime(history.createdAt),
                            `"${history.article}"`,
                            history.oldQty,
                            history.newQty,
                            history.changeAmount,
                            history.changeType,
                            `"${history.notes || ''}"`,
                            `"${history.updatedBy || ''}"`
                        ].join(','))
                    ].join('\n');
                    
                    this.downloadCSV(csvData, `qty-history-${this.selectedItemForHistory.article}-${new Date().toISOString().split('T')[0]}.csv`);
                    this.showNotificationMessage('Riwayat berhasil diexport', 'success');
                },
                
                // Methods untuk bulk update
                openBulkUpdateModal() {
                    this.selectedItemsForBulk = [];
                    this.bulkUpdateData = { adjustment: 0, notes: '' };
                    this.showBulkUpdateModal = true;
                },
                
                async submitBulkUpdate() {
                    if (this.selectedItemsForBulk.length === 0) {
                        this.showNotificationMessage('Pilih minimal satu item', 'error');
                        return;
                    }
                    
                    if (!this.bulkUpdateData.adjustment) {
                        this.showNotificationMessage('Masukkan nilai adjustment', 'error');
                        return;
                    }
                    
                    this.bulkUpdateLoading = true;
                    
                    try {
                        const items = this.selectedItemsForBulk.map(id => ({
                            id,
                            adjustment: parseInt(this.bulkUpdateData.adjustment)
                        }));
                        
                        const payload = {
                            items,
                            changeType: 'adjustment',
                            notes: this.bulkUpdateData.notes || `Bulk adjustment by ${this.bulkUpdateData.adjustment}`,
                            updatedBy: 'System'
                        };
                        
                        const response = await fetch('/api/items/bulk/update-qty', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.message || 'Gagal melakukan bulk update');
                        }
                        
                        const result = await response.json();
                        
                        // Refresh data
                        await this.loadItems();
                        await this.loadRecentActivities();
                        
                        this.showBulkUpdateModal = false;
                        this.showNotificationMessage(
                            `Berhasil mengupdate ${result.updatedCount} items`,
                            'success'
                        );
                        
                    } catch (err) {
                        this.showNotificationMessage('Gagal melakukan bulk update: ' + err.message, 'error');
                    } finally {
                        this.bulkUpdateLoading = false;
                    }
                },
                
                // Methods untuk fitur label
                openLabelModal(item) {
                    this.selectedItemForLabel = { ...item };
                    this.labelCopies = 1;
                    this.labelSize = 'medium';
                    this.labelShowQR = true;
                    this.labelShowBarcode = true;
                    this.showLabelModal = true;
                },
                
                async printLabels() {
                    if (!this.selectedItemForLabel) return;
                    
                    const item = this.selectedItemForLabel;
                    
                    try {
                        // Get QR code for label
                        let qrCodeURL = '';
                        if (this.labelShowQR) {
                            const qrResponse = await fetch(`/api/items/${item.id}/label-qrcode`);
                            if (qrResponse.ok) {
                                const blob = await qrResponse.blob();
                                qrCodeURL = URL.createObjectURL(blob);
                            }
                        }
                        
                        const printWindow = window.open('', '_blank');
                        
                        // CSS untuk label berdasarkan ukuran
                        const labelStyles = {
                            small: 'width: 2in; height: 1in; font-size: 8px; padding: 0.05in;',
                            medium: 'width: 3in; height: 2in; font-size: 10px; padding: 0.1in;',
                            large: 'width: 4in; height: 3in; font-size: 12px; padding: 0.15in;'
                        };
                        
                        let labelsHTML = '';
                        for (let i = 0; i < this.labelCopies; i++) {
                            labelsHTML += `
                                <div class="label" style="${labelStyles[this.labelSize]} border: 1px solid #000; margin: 0.1in; display: inline-block; vertical-align: top; page-break-inside: avoid; background: white; box-sizing: border-box;">
                                    <div class="label-header" style="border-bottom: 1px solid #333; padding-bottom: 0.05in; margin-bottom: 0.1in; text-align: center;">
                                        <h4 style="margin: 0; font-weight: bold; font-size: 1.2em;">WAREHOUSE LABEL</h4>
                                    </div>
                                    
                                    <div class="label-content" style="text-align: center;">
                                        <p style="margin: 0.05in 0; font-weight: bold; font-size: 1.3em; word-break: break-word;">${item.article}</p>
                                        <p style="margin: 0.03in 0; color: #555;">${item.komponen}</p>
                                        
                                        <div style="display: flex; justify-content: space-between; margin: 0.1in 0;">
                                            <div style="text-align: left;">
                                                <p style="margin: 0.02in 0; font-size: 0.9em;"><strong>ID:</strong> ${item.id}</p>
                                                <p style="margin: 0.02in 0; font-size: 0.9em;"><strong>PO:</strong> ${item.noPo || '-'}</p>
                                            </div>
                                            <div style="text-align: right;">
                                                <p style="margin: 0.02in 0; font-size: 0.9em;"><strong>Stok:</strong> ${item.qty}</p>
                                                <p style="margin: 0.02in 0; font-size: 0.9em;"><strong>Min:</strong> ${item.minStock}</p>
                                            </div>
                                        </div>
                                        
                                        <div style="margin: 0.1in 0; padding: 0.05in; background: #f0f0f0; border-radius: 3px;">
                                            <p style="margin: 0; font-weight: bold; font-size: 1.5em;">${item.kolom || 'LOKASI'}</p>
                                        </div>
                                        
                                        ${this.labelShowQR && qrCodeURL ? `
                                        <div style="margin: 0.05in auto; text-align: center;">
                                            <img src="${qrCodeURL}" alt="QR Code" style="width: 0.8in; height: 0.8in;">
                                        </div>
                                        ` : this.labelShowQR ? `
                                        <div style="margin: 0.05in auto; width: 0.8in; height: 0.8in; background: #f0f0f0; display: flex; align-items: center; justify-content: center;">
                                            <span style="font-size: 0.7em; color: #666;">QR Code</span>
                                        </div>
                                        ` : ''}
                                        
                                        ${this.labelShowBarcode ? `
                                        <div style="margin: 0.05in 0; text-align: center;">
                                            <div style="display: inline-block; padding: 0.03in 0.1in; border: 1px solid #000; letter-spacing: 0.1em; font-family: 'Courier New', monospace; font-weight: bold;">
                                                ${item.id.toString().padStart(6, '0')}
                                            </div>
                                            <p style="font-size: 0.7em; margin: 0.02in 0; color: #666;">ID: ${item.id}</p>
                                        </div>
                                        ` : ''}
                                        
                                        <p style="font-size: 0.7em; color: #666; margin-top: 0.1in; border-top: 1px dashed #ccc; padding-top: 0.05in;">
                                            ${new Date().toLocaleDateString('id-ID')} | WMS v4.1
                                        </p>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Hitung jumlah kolom berdasarkan ukuran label
                        const columns = {
                            small: 4,
                            medium: 3,
                            large: 2
                        }[this.labelSize];
                        
                        printWindow.document.write(`
                            <!DOCTYPE html>
                            <html>
                                <head>
                                    <title>Label - ${item.article}</title>
                                    <style>
                                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                                        body {
                                            font-family: 'Inter', Arial, sans-serif;
                                            margin: 0;
                                            padding: 0.25in;
                                            background: white;
                                            -webkit-print-color-adjust: exact !important;
                                            color-adjust: exact !important;
                                        }
                                        @media print {
                                            body {
                                                padding: 0 !important;
                                                margin: 0 !important;
                                            }
                                            .label {
                                                border: 1px solid #000 !important;
                                                margin: 0.1in !important;
                                                -webkit-print-color-adjust: exact;
                                                print-color-adjust: exact;
                                            }
                                            .no-print {
                                                display: none !important;
                                            }
                                            @page {
                                                margin: 0.25in;
                                                size: letter;
                                            }
                                        }
                                        .label-container {
                                            display: grid;
                                            grid-template-columns: repeat(${columns}, 1fr);
                                            gap: 0.1in;
                                            width: 100%;
                                        }
                                        .controls {
                                            background: #f5f5f5;
                                            padding: 10px;
                                            margin-bottom: 10px;
                                            border-radius: 5px;
                                            position: sticky;
                                            top: 0;
                                            z-index: 100;
                                        }
                                        button {
                                            padding: 10px 20px;
                                            background: #4CAF50;
                                            color: white;
                                            border: none;
                                            border-radius: 5px;
                                            cursor: pointer;
                                            font-family: 'Inter', sans-serif;
                                            font-size: 14px;
                                            margin-right: 10px;
                                        }
                                        button:hover {
                                            background: #45a049;
                                        }
                                        button.close-btn {
                                            background: #f44336;
                                        }
                                        button.close-btn:hover {
                                            background: #da190b;
                                        }
                                    </style>
                                </head>
                                <body>
                                    <div class="controls no-print">
                                        <h3>Label untuk: ${item.article}</h3>
                                        <p>Jumlah label: ${this.labelCopies} | Ukuran: ${this.labelSize} | ID Item: ${item.id}</p>
                                        <button onclick="window.print()">
                                            <i class="fas fa-print"></i> Print Labels
                                        </button>
                                        <button onclick="window.close()" class="close-btn">
                                            <i class="fas fa-times"></i> Close
                                        </button>
                                    </div>
                                    
                                    <div class="label-container">
                                        ${labelsHTML}
                                    </div>
                                    
                                    <script>
                                        // Auto close setelah print
                                        window.onafterprint = function() {
                                            setTimeout(function() {
                                                window.close();
                                            }, 1000);
                                        };
                                    <\/script>
                                </body>
                            </html>
                        `);
                        printWindow.document.close();
                        
                        this.showLabelModal = false;
                        this.showNotificationMessage(`Label untuk ${item.article} siap dicetak`, 'success');
                        
                    } catch (err) {
                        console.error('Error printing labels:', err);
                        this.showNotificationMessage('Gagal mencetak label: ' + err.message, 'error');
                    }
                },
                
                openBulkLabelModal() {
                    this.selectedItemsForBulkLabel = [];
                    this.bulkLabelCopies = 1;
                    this.bulkLabelFormat = 'standard';
                    this.bulkLabelSize = 'medium';
                    this.showBulkLabelModal = true;
                },
                
                async printBulkLabels() {
                    const selectedItems = this.items.filter(item => 
                        this.selectedItemsForBulkLabel.includes(item.id)
                    );
                    
                    if (selectedItems.length === 0) {
                        this.showNotificationMessage('Pilih minimal satu item untuk label', 'error');
                        return;
                    }
                    
                    try {
                        // Ambil data label dari server
                        const response = await fetch('/api/labels/bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                itemIds: selectedItems.map(item => item.id)
                            })
                        });
                        
                        if (!response.ok) {
                            throw new Error('Gagal mengambil data label');
                        }
                        
                        const result = await response.json();
                        
                        if (!result.success || !result.labels) {
                            throw new Error('Data label tidak valid');
                        }
                        
                        // Tentukan ukuran label
                        const labelSize = {
                            small: { width: '2in', height: '1in', fontSize: '8px' },
                            medium: { width: '3in', height: '2in', fontSize: '10px' },
                            large: { width: '4in', height: '3in', fontSize: '12px' }
                        }[this.bulkLabelSize];
                        
                        // Buat jendela cetak
                        const printWindow = window.open('', '_blank');
                        
                        let labelsHTML = '';
                        
                        // Generate HTML untuk semua label
                        result.labels.forEach((label, index) => {
                            for (let i = 0; i < this.bulkLabelCopies; i++) {
                                labelsHTML += `
                                    <div class="label" style="
                                        width: ${labelSize.width}; 
                                        height: ${labelSize.height}; 
                                        border: 1px solid #000; 
                                        padding: 0.1in; 
                                        margin: 0.1in; 
                                        display: inline-block; 
                                        vertical-align: top; 
                                        page-break-inside: avoid; 
                                        background: white; 
                                        box-sizing: border-box;
                                        font-size: ${labelSize.fontSize};
                                    ">
                                        <div style="text-align: center; height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
                                            <div>
                                                <h4 style="margin: 0.05in 0; font-weight: bold; word-break: break-word; text-transform: uppercase;">
                                                    ${label.article}
                                                </h4>
                                                <p style="margin: 0.03in 0; color: #555;">
                                                    ${label.komponen}
                                                </p>
                                                <p style="margin: 0.02in 0;">
                                                    ID: ${label.id} | Lokasi: ${label.kolom || '-'}
                                                </p>
                                            </div>
                                            
                                            <div style="background: #f0f0f0; padding: 0.05in; margin: 0.05in 0; border-radius: 3px;">
                                                <p style="margin: 0; font-weight: bold; font-size: 1.2em; letter-spacing: 1px;">
                                                    ${label.kolom || 'LOKASI'}
                                                </p>
                                            </div>
                                            
                                            <div>
                                                <p style="margin: 0.03in 0; font-weight: bold;">
                                                    Stok: ${label.qty} | ${new Date(label.timestamp).toLocaleDateString('id-ID')}
                                                </p>
                                                
                                                ${this.bulkLabelFormat !== 'simple' ? `
                                                <div style="margin: 0.05in auto; text-align: center;">
                                                    <img src="${label.qrCodeDataURL}" alt="QR Code" 
                                                         style="width: 0.6in; height: 0.6in; image-rendering: crisp-edges;">
                                                </div>
                                                ` : ''}
                                                
                                                ${this.bulkLabelFormat === 'detailed' ? `
                                                <div style="margin: 0.05in 0; padding: 0.03in; background: #f8f8f8; border-radius: 2px;">
                                                    <p style="margin: 0; color: #666;">
                                                        <strong>Barcode:</strong> ${label.barcode || label.id.toString().padStart(6, '0')}
                                                    </p>
                                                </div>
                                                ` : ''}
                                                
                                                <p style="color: #666; margin-top: 0.05in; border-top: 1px dashed #ccc; padding-top: 0.05in;">
                                                    WMS v4.1 | ${index + 1}/${result.count}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }
                        });
                        
                        // Hitung jumlah kolom berdasarkan ukuran label
                        const columns = {
                            small: 4,
                            medium: 3,
                            large: 2
                        }[this.bulkLabelSize];
                        
                        printWindow.document.write(`
                            <!DOCTYPE html>
                            <html>
                                <head>
                                    <title>Label Massal - ${selectedItems.length} items</title>
                                    <style>
                                        * {
                                            margin: 0;
                                            padding: 0;
                                            box-sizing: border-box;
                                            -webkit-print-color-adjust: exact !important;
                                            print-color-adjust: exact !important;
                                        }
                                        
                                        body {
                                            font-family: 'Inter', Arial, sans-serif;
                                            margin: 0.25in;
                                            padding: 0;
                                            background: white;
                                        }
                                        
                                        @media print {
                                            body {
                                                margin: 0 !important;
                                                padding: 0 !important;
                                            }
                                            
                                            .label {
                                                border: 1px solid #000 !important;
                                                -webkit-print-color-adjust: exact;
                                                print-color-adjust: exact;
                                            }
                                            
                                            .no-print {
                                                display: none !important;
                                            }
                                            
                                            @page {
                                                margin: 0.25in;
                                                size: letter;
                                            }
                                        }
                                        
                                        .label-container {
                                            display: grid;
                                            grid-template-columns: repeat(${columns}, 1fr);
                                            gap: 0.1in;
                                            width: 100%;
                                        }
                                        
                                        .controls {
                                            background: #f5f5f5;
                                            padding: 10px;
                                            margin-bottom: 10px;
                                            border-radius: 5px;
                                            position: sticky;
                                            top: 0;
                                            z-index: 100;
                                        }
                                        
                                        button {
                                            padding: 10px 20px;
                                            background: #4CAF50;
                                            color: white;
                                            border: none;
                                            border-radius: 5px;
                                            cursor: pointer;
                                            font-family: 'Inter', sans-serif;
                                            font-size: 14px;
                                            margin-right: 10px;
                                        }
                                        
                                        button:hover {
                                            background: #45a049;
                                        }
                                        
                                        button.close-btn {
                                            background: #f44336;
                                        }
                                        
                                        button.close-btn:hover {
                                            background: #da190b;
                                        }
                                        
                                        .summary {
                                            background: #e8f5e9;
                                            padding: 10px;
                                            border-radius: 5px;
                                            margin-bottom: 10px;
                                        }
                                    </style>
                                    
                                    <script>
                                        window.onload = function() {
                                            // Auto close setelah print
                                            window.onafterprint = function() {
                                                setTimeout(function() {
                                                    window.close();
                                                }, 1000);
                                            };
                                        };
                                    <\/script>
                                </head>
                                <body>
                                    <div class="controls no-print">
                                        <div class="summary">
                                            <h3>Label Massal</h3>
                                            <p>Jumlah Item: ${selectedItems.length} | Label per Item: ${this.bulkLabelCopies} | Total Label: ${selectedItems.length * this.bulkLabelCopies}</p>
                                            <p>Format: ${this.bulkLabelFormat} | Ukuran: ${this.bulkLabelSize} | Kolom per halaman: ${columns}</p>
                                        </div>
                                        <button onclick="window.print()">
                                            <i class="fas fa-print"></i> Print All Labels (${selectedItems.length * this.bulkLabelCopies})
                                        </button>
                                        <button onclick="window.close()" class="close-btn">
                                            <i class="fas fa-times"></i> Close
                                        </button>
                                    </div>
                                    
                                    <div class="label-container">
                                        ${labelsHTML}
                                    </div>
                                    
                                    <div class="no-print" style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
                                        <p>Warehouse Management System v4.1 - Label Massal</p>
                                        <p>Generated: ${new Date().toLocaleString('id-ID')}</p>
                                    </div>
                                </body>
                            </html>
                        `);
                        
                        printWindow.document.close();
                        
                        this.showBulkLabelModal = false;
                        this.showNotificationMessage(
                            `Berhasil membuat ${selectedItems.length * this.bulkLabelCopies} label untuk ${selectedItems.length} item`,
                            'success'
                        );
                        
                    } catch (err) {
                        console.error('Error printing bulk labels:', err);
                        this.showNotificationMessage('Gagal mencetak label massal: ' + err.message, 'error');
                    }
                },
                
                toggleSelectAllBulkLabels() {
                    if (this.selectedItemsForBulkLabel.length === this.items.length) {
                        // Jika semua sudah terpilih, hapus semua
                        this.selectedItemsForBulkLabel = [];
                    } else {
                        // Pilih semua items
                        this.selectedItemsForBulkLabel = this.items.map(item => item.id);
                    }
                },
                
                toggleActivityView() {
                    this.showScanLogs = !this.showScanLogs;
                },
                
                openScanLogs() {
                    this.showScanLogs = true;
                    this.loadScanLogs();
                },
                
                // Utility methods
                resetForm() {
                    this.currentItem = {
                        id: null,
                        article: '',
                        komponen: '',
                        noPo: '',
                        order: 0,
                        qty: 0,
                        minStock: 10,
                        kolom: ''
                    };
                },
                
                applyFilter() {
                    this.currentPage = 1;
                    this.loadItems();
                },
                
                clearFilter() {
                    this.filter = {
                        kolom: '',
                        komponen: '',
                        search: ''
                    };
                    this.showLowStock = false;
                    this.tableSearch = '';
                    this.currentPage = 1;
                    this.loadItems();
                },
                
                getFilterDescription() {
                    const filters = [];
                    if (this.filter.kolom) filters.push(`Lokasi: ${this.filter.kolom}`);
                    if (this.filter.komponen) filters.push(`Komponen: ${this.filter.komponen}`);
                    if (this.filter.search) filters.push(`Pencarian: ${this.filter.search}`);
                    if (this.showLowStock) filters.push('Stok Rendah');
                    return filters.join(', ') || 'Semua item';
                },
                
                sortTable(field) {
                    if (this.sortField === field) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortField = field;
                        this.sortDirection = 'asc';
                    }
                },
                
                previousPage() {
                    if (this.currentPage > 1) this.currentPage--;
                },
                
                nextPage() {
                    if (this.currentPage * this.itemsPerPage < this.filteredItems.length) this.currentPage++;
                },
                
                getQtyBadgeClass(qty, minStock) {
                    if (qty <= minStock) return 'badge-red';
                    if (qty <= minStock * 2) return 'badge-yellow';
                    return 'badge-green';
                },
                
                getStatusBadgeClass(qty, minStock) {
                    if (qty <= minStock) return 'badge-red';
                    if (qty <= minStock * 2) return 'badge-yellow';
                    return 'badge-green';
                },
                
                getStatusIcon(qty, minStock) {
                    if (qty <= minStock) return 'fas fa-exclamation-circle mr-1';
                    if (qty <= minStock * 2) return 'fas fa-exclamation-triangle mr-1';
                    return 'fas fa-check-circle mr-1';
                },
                
                getStatusText(qty, minStock) {
                    if (qty <= minStock) return 'Stok Rendah';
                    if (qty <= minStock * 2) return 'Stok Sedang';
                    return 'Stok Aman';
                },
                
                async exportToCSV() {
                    if (this.items.length === 0) {
                        this.showNotificationMessage('Tidak ada data untuk diexport', 'error');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/export/csv');
                        if (!response.ok) throw new Error('Gagal mengexport data');
                        
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `warehouse-export-${new Date().toISOString().split('T')[0]}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                        
                        this.showNotificationMessage('Data berhasil diexport ke CSV', 'success');
                    } catch (err) {
                        this.showNotificationMessage('Gagal mengexport data: ' + err.message, 'error');
                    }
                },
                
                downloadCSV(csvData, filename) {
                    const blob = new Blob([csvData], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                },
                
                openPrintView() {
                    const printWindow = window.open('', '_blank');
                    printWindow.document.write(`
                        <html>
                            <head>
                                <title>Warehouse Report - ${new Date().toLocaleDateString()}</title>
                                <style>
                                    body { font-family: Arial, sans-serif; margin: 20px; }
                                    h1 { color: #333; }
                                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                                    th { background-color: #f2f2f2; }
                                    .low-stock { background-color: #ffe6e6; }
                                    @media print {
                                        .no-print { display: none; }
                                    }
                                </style>
                            </head>
                            <body>
                                <h1>Warehouse Report</h1>
                                <p>Generated: ${new Date().toLocaleString()}</p>
                                <p>Total Items: ${this.items.length}</p>
                                <p>Low Stock Items: ${this.lowStockCount}</p>
                                <p>QR Scans Today: ${this.todayScanCount}</p>
                                
                                <table>
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Article</th>
                                            <th>Komponen</th>
                                            <th>Qty</th>
                                            <th>Min Stock</th>
                                            <th>Lokasi</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${this.items.map(item => `
                                            <tr class="${item.qty <= item.minStock ? 'low-stock' : ''}">
                                                <td>${item.id}</td>
                                                <td>${item.article}</td>
                                                <td>${item.komponen}</td>
                                                <td>${item.qty}</td>
                                                <td>${item.minStock}</td>
                                                <td>${item.kolom || '-'}</td>
                                                <td>${item.qty <= item.minStock ? 'LOW STOCK' : 'OK'}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                                
                                <div class="no-print" style="margin-top: 20px;">
                                    <button onclick="window.print()">Print Report</button>
                                    <button onclick="window.close()">Close</button>
                                </div>
                            </body>
                        </html>
                    `);
                    printWindow.document.close();
                },
                
                openSettingsModal() {
                    this.showNotificationMessage('Settings feature coming soon', 'info');
                },
                
                formatNumber(num) {
                    return new Intl.NumberFormat('id-ID').format(num);
                },
                
                formatDateTime(dateString) {
                    const date = new Date(dateString);
                    return date.toLocaleDateString('id-ID') + ' ' + date.toLocaleTimeString('id-ID');
                },
                
                formatTimeAgo(dateString) {
                    if (!dateString) return '';
                    
                    const date = new Date(dateString);
                    const now = new Date();
                    const diffMs = now - date;
                    const diffMins = Math.floor(diffMs / 60000);
                    
                    if (diffMins < 1) return 'baru saja';
                    if (diffMins < 60) return `${diffMins} menit lalu`;
                    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} jam lalu`;
                    return `${Math.floor(diffMins / 1440)} hari lalu`;
                },
                
                showNotificationMessage(message, type = 'success') {
                    this.notificationMessage = message;
                    this.notificationType = type;
                    this.showNotification = true;
                    
                    setTimeout(() => {
                        this.showNotification = false;
                    }, 3000);
                }
            };
        }
