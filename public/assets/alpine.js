function warehouseApp() {
    return {
        // ========== AUTH STATE ==========
        user: null,
        loginData: { username: '', password: '' },
        loginError: '',
        loginLoading: false,
        showLoginModal: true,

        // ========== EXISTING STATE ==========
        items: [],
        currentItem: { id: null, article: '', komponen: '', noPo: '', order: 0, qty: 0, minStock: 10, kolom: '', categoryId: null },
        filter: { kolom: '', komponen: '', search: '' },
        loading: false,
        error: '',
        showNotification: false,
        notificationMessage: '',
        notificationType: 'success',
        showLowStock: false,

        // Qty update
        showQtyDetailModal: false,
        showQtyHistoryModal: false,
        showBulkUpdateModal: false,
        selectedItemForQtyUpdate: null,
        selectedItemForHistory: null,
        qtyUpdateDetail: { method: 'adjust', newQty: 0, adjustment: 0, changeType: 'adjustment', notes: '' },
        bulkUpdateData: { adjustment: 0, notes: '' },
        selectedItemsForBulk: [],
        qtyHistory: [],
        recentActivities: [],
        recentScans: [],
        historyFilter: { changeType: '', limit: '10', startDate: '' },
        stats: {},

        // Table
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

        // Label
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

        // QR Scanner
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
        todayScanCount: 0,
        showScanLogs: false,

        // ========== USER MANAGEMENT (ADMIN ONLY) ==========
        showUserModal: false,
        users: [],
        newUser: { username: '', password: '', role: 'operator' },
        userLoading: false,
        userError: '',

        // ========== CATEGORY MANAGEMENT (ADMIN ONLY) ==========
        categories: [],
        showCategoryModal: false,
        newCategory: { name: '', description: '' },
        categoryLoading: false,

        // ========== MODAL ITEM (ADMIN ONLY) ==========
        showItemModal: false,

        // ========== COMPUTED ==========
        get isAuthenticated() {
            return this.user !== null;
        },
        get isAdmin() {
            return this.user?.role === 'admin';
        },
        get isStaff() {
            return this.user?.role === 'staff';
        },
        get isOperator() {
            return this.user?.role === 'operator';
        },
        get canManageItems() {
            return this.isAdmin || this.isStaff;
        },
        get filteredItems() {
            let filtered = this.items;
            if (this.showLowStock) filtered = filtered.filter(item => item.qty <= item.minStock);
            if (this.tableSearch) {
                const search = this.tableSearch.toLowerCase();
                filtered = filtered.filter(item => 
                    item.article.toLowerCase().includes(search) ||
                    item.komponen.toLowerCase().includes(search) ||
                    (item.noPo && item.noPo.toLowerCase().includes(search)) ||
                    (item.kolom && item.kolom.toLowerCase().includes(search)) ||
                    (item.Category?.name && item.Category.name.toLowerCase().includes(search))
                );
            }
            return filtered;
        },
        get filteredAndSortedItems() {
            let items = this.filteredItems;
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
            const start = (this.currentPage - 1) * this.itemsPerPage;
            return items.slice(start, start + this.itemsPerPage);
        },
        get totalQty() {
            return this.items.reduce((sum, item) => sum + parseInt(item.qty || 0), 0);
        },
        get totalOrder() {
            return this.items.reduce((sum, item) => sum + parseInt(item.order || 0), 0);
        },
        get uniqueLocations() {
            return [...new Set(this.items.map(item => item.kolom).filter(Boolean))].length;
        },
        get uniqueLocationsList() {
            return [...new Set(this.items.map(item => item.kolom).filter(Boolean))].sort();
        },
        get uniqueKomponenList() {
            return [...new Set(this.items.map(item => item.komponen).filter(Boolean))].sort();
        },
        get lowStockCount() {
            return this.items.filter(item => item.qty <= item.minStock).length;
        },
        get itemsWithNoPo() {
            return this.items.filter(item => item.noPo && item.noPo.trim() !== '').length;
        },

        // ========== INIT ==========
        async init() {
            await this.initAuth();
            if (this.isAuthenticated) {
                await this.loadInitialData();
                setInterval(() => {
                    this.loadItems();
                    this.loadStats();
                }, 60000);
            }
        },

        async initAuth() {
            try {
                const res = await fetch('/api/me');
                if (res.ok) {
                    this.user = await res.json();
                } else {
                    this.user = null;
                }
            } catch (err) {
                this.user = null;
            }
        },

        async loadInitialData() {
            await Promise.all([
                this.loadItems(),
                this.loadStats(),
                this.loadRecentActivities(),
                this.loadScanLogs(),
                this.loadUniqueValues(),
                this.loadCategories()
            ]);
            this.checkCameraAvailability();
        },

        // ========== AUTH METHODS ==========
        async login() {
            this.loginLoading = true;
            this.loginError = '';
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.loginData)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Login gagal');
                this.user = data.user;
                this.loginData = { username: '', password: '' };
                this.showLoginModal = false;
                await this.loadInitialData();
            } catch (err) {
                this.loginError = err.message;
            } finally {
                this.loginLoading = false;
            }
        },

        async logout() {
            try {
                await fetch('/api/logout', { method: 'POST' });
                this.user = null;
                this.items = [];
                this.recentActivities = [];
                this.recentScans = [];
            } catch (err) {
                this.showNotificationMessage('Logout gagal', 'error');
            }
        },

        // ========== API HELPER ==========
        async fetchWithAuth(url, options = {}) {
            const res = await fetch(url, options);
            if (res.status === 401) {
                this.user = null;
                this.showNotificationMessage('Sesi habis, silakan login ulang', 'error');
                throw new Error('Unauthorized');
            }
            return res;
        },

        // ========== USER MANAGEMENT ==========
        async loadUsers() {
            if (!this.isAdmin) return;
            this.userLoading = true;
            try {
                const res = await this.fetchWithAuth('/api/users');
                this.users = await res.json();
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Gagal memuat users: ' + err.message, 'error');
            } finally {
                this.userLoading = false;
            }
        },

        async addUser() {
            if (!this.isAdmin) return;
            if (!this.newUser.username.trim() || !this.newUser.password.trim()) {
                this.showNotificationMessage('Username dan password harus diisi', 'error');
                return;
            }
            this.userLoading = true;
            try {
                const res = await this.fetchWithAuth('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newUser)
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Gagal menambah user');
                }
                const user = await res.json();
                this.users.push(user);
                this.newUser = { username: '', password: '', role: 'operator' };
                this.showNotificationMessage(`User ${user.username} berhasil ditambahkan`, 'success');
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage(err.message, 'error');
            } finally {
                this.userLoading = false;
            }
        },

        async deleteUser(userId, username) {
            if (!this.isAdmin) return;
            if (!confirm(`Hapus user "${username}"?`)) return;
            try {
                const res = await this.fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Gagal menghapus user');
                this.users = this.users.filter(u => u.id !== userId);
                this.showNotificationMessage('User berhasil dihapus', 'success');
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage(err.message, 'error');
            }
        },

        openUserModal() {
            if (this.isAdmin) {
                this.showUserModal = true;
                this.userError = '';
                this.loadUsers();
            }
        },

        closeUserModal() {
            this.showUserModal = false;
            this.users = [];
            this.newUser = { username: '', password: '', role: 'operator' };
        },

        // ========== CATEGORY MANAGEMENT ==========
        async loadCategories() {
            if (!this.isAuthenticated) return;
            try {
                const res = await this.fetchWithAuth('/api/categories');
                this.categories = await res.json();
            } catch (err) {}
        },

        async addCategory() {
            if (!this.isAdmin) return;
            if (!this.newCategory.name.trim()) {
                this.showNotificationMessage('Nama kategori harus diisi', 'error');
                return;
            }
            this.categoryLoading = true;
            try {
                const res = await this.fetchWithAuth('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newCategory)
                });
                const cat = await res.json();
                this.categories.push(cat);
                this.newCategory = { name: '', description: '' };
                this.showNotificationMessage('Kategori berhasil ditambahkan', 'success');
            } catch (err) {
                this.showNotificationMessage(err.message, 'error');
            } finally {
                this.categoryLoading = false;
            }
        },

        async deleteCategory(id, name) {
            if (!this.isAdmin) return;
            if (!confirm(`Hapus kategori "${name}"?`)) return;
            try {
                await this.fetchWithAuth(`/api/categories/${id}`, { method: 'DELETE' });
                this.categories = this.categories.filter(c => c.id !== id);
                this.showNotificationMessage('Kategori berhasil dihapus', 'success');
            } catch (err) {
                this.showNotificationMessage(err.message, 'error');
            }
        },

        openCategoryModal() {
            if (this.isAdmin) {
                this.showCategoryModal = true;
                this.loadCategories();
            }
        },

        closeCategoryModal() {
            this.showCategoryModal = false;
            this.categories = [];
            this.newCategory = { name: '', description: '' };
        },

        // ========== CRUD & DATA LOADING ==========
        async loadItems() {
            if (!this.isAuthenticated) return;
            this.loading = true;
            this.error = '';
            try {
                let url = '/api/items';
                const params = [];
                if (this.filter.kolom) params.push(`kolom=${encodeURIComponent(this.filter.kolom)}`);
                if (this.filter.komponen) params.push(`komponen=${encodeURIComponent(this.filter.komponen)}`);
                if (this.filter.search) params.push(`search=${encodeURIComponent(this.filter.search)}`);
                if (params.length) url += '?' + params.join('&');
                const response = await this.fetchWithAuth(url);
                const data = await response.json();
                this.items = Array.isArray(data) ? data : data.items || [];
            } catch (err) {
                if (err.message !== 'Unauthorized') {
                    this.error = err.message;
                    this.showNotificationMessage('Gagal memuat data: ' + err.message, 'error');
                }
            } finally {
                this.loading = false;
            }
        },

        async loadStats() {
            if (!this.isAuthenticated) return;
            try {
                const res = await this.fetchWithAuth('/api/dashboard/stats');
                this.stats = await res.json();
                const today = new Date().toDateString();
                this.todayScanCount = this.recentScans.filter(scan => 
                    new Date(scan.createdAt).toDateString() === today
                ).length;
            } catch (err) {}
        },

        async loadRecentActivities() {
            if (!this.isAuthenticated) return;
            try {
                const res = await this.fetchWithAuth('/api/qty-history?limit=5');
                this.recentActivities = await res.json();
            } catch (err) {}
        },

        async loadScanLogs() {
            if (!this.isAuthenticated) return;
            try {
                const res = await this.fetchWithAuth('/api/scan-logs?limit=10');
                this.recentScans = await res.json();
            } catch (err) {}
        },

        async loadUniqueValues() {
            if (!this.isAuthenticated) return;
            try {
                await this.fetchWithAuth('/api/unique-values');
            } catch (err) {}
        },

        // ========== QR SCANNER ==========
        async checkCameraAvailability() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.cameraAvailable = devices.some(d => d.kind === 'videoinput');
            } catch { this.cameraAvailable = false; }
        },

        openQRScanModal() {
            this.showQRScanModal = true;
            this.scannedItem = null;
            this.scannedItems = [];
            this.qrManualInput = '';
            this.qrUploadedImage = null;
        },

        closeQRScanModal() {
            this.showQRScanModal = false;
            this.stopCameraScan();
        },

        async startCameraScan() {
            if (!this.cameraAvailable) { this.showNotificationMessage('Kamera tidak tersedia', 'error'); return; }
            this.cameraScanning = true;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                this.videoStream = stream;
                const video = document.getElementById('qr-video');
                video.srcObject = stream;
                video.play();
                this.scanQRFromCamera();
            } catch (err) {
                this.cameraScanning = false;
                this.showNotificationMessage('Tidak dapat mengakses kamera', 'error');
            }
        },

        stopCameraScan() {
            if (this.videoStream) {
                this.videoStream.getTracks().forEach(track => track.stop());
                this.videoStream = null;
            }
            this.cameraScanning = false;
            const video = document.getElementById('qr-video');
            if (video) video.srcObject = null;
        },

        scanQRFromCamera() {
            if (!this.cameraScanning) return;
            const video = document.getElementById('qr-video');
            const canvas = document.getElementById('qr-canvas');
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, canvas.width, canvas.height);
                if (code) {
                    this.processQRCode(code.data);
                    this.stopCameraScan();
                }
            }
            requestAnimationFrame(() => this.scanQRFromCamera());
        },

        handleQRFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { this.showNotificationMessage('File terlalu besar (maks 5MB)', 'error'); return; }
            const reader = new FileReader();
            reader.onload = (e) => this.qrUploadedImage = e.target.result;
            reader.readAsDataURL(file);
        },

        async scanUploadedQR() {
            if (!this.qrUploadedImage) { this.showNotificationMessage('Silakan upload gambar', 'error'); return; }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, canvas.width, canvas.height);
                if (code) {
                    this.processQRCode(code.data);
                    this.showNotificationMessage('QR Code berhasil dipindai', 'success');
                } else {
                    this.showNotificationMessage('Tidak dapat membaca QR Code', 'error');
                }
            };
            img.src = this.qrUploadedImage;
        },

        async processQRCode(qrData) {
            if (!qrData?.trim()) { this.showNotificationMessage('QR Code data kosong', 'error'); return; }
            try {
                const response = await this.fetchWithAuth('/api/qr-scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        qrData: qrData.trim(), 
                        type: this.qrType, 
                        scannedBy: this.user.username
                    })
                });
                const result = await response.json();
                this.lastScanTime = new Date().toISOString();
                if (result.success && result.items?.length) {
                    this.scannedItems = result.items;
                    this.scannedItem = result.items[0];
                    await this.loadScanLogs();
                    this.showNotificationMessage(`Item ditemukan: ${this.scannedItem.article}`, 'success');
                } else {
                    this.showNotificationMessage('Item tidak ditemukan', 'error');
                }
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Error: ' + err.message, 'error');
            }
        },

        selectScannedItem(item) { this.scannedItem = item; },

        openQRDetailUpdate() {
            if (this.scannedItem) {
                this.openQtyDetailModal(this.scannedItem);
                this.closeQRScanModal();
            }
        },

        // ========== CRUD ITEM ==========
        openAddItemModal() {
            if (!this.canManageItems) return;
            this.resetForm();
            this.showItemModal = true;
        },

        editItem(item) {
            if (!this.canManageItems) return;
            this.currentItem = { ...item, categoryId: item.categoryId };
            this.showItemModal = true;
        },

        async saveItem() {
            if (!this.currentItem.article.trim() || !this.currentItem.komponen.trim()) {
                this.showNotificationMessage('Article dan Komponen harus diisi', 'error');
                return;
            }
            if (this.currentItem.qty < 0) { this.showNotificationMessage('Quantity tidak boleh negatif', 'error'); return; }
            this.savingItem = true;
            try {
                let url = '/api/items';
                let method = 'POST';
                if (this.currentItem.id) {
                    url = `/api/items/${this.currentItem.id}`;
                    method = 'PUT';
                }
                const response = await this.fetchWithAuth(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.currentItem)
                });
                await this.loadItems();
                this.resetForm();
                this.showItemModal = false;
                this.showNotificationMessage(this.currentItem.id ? 'Item berhasil diperbarui' : 'Item baru berhasil ditambahkan', 'success');
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Gagal menyimpan data: ' + err.message, 'error');
            } finally {
                this.savingItem = false;
            }
        },

        duplicateItem(item) { this.currentItem = { ...item, id: null, article: item.article + ' (Copy)', categoryId: item.categoryId }; document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' }); },
        resetForm() { this.currentItem = { id: null, article: '', komponen: '', noPo: '', order: 0, qty: 0, minStock: 10, kolom: '', categoryId: null }; },

        async deleteItem(id) {
            if (!this.isAdmin) return;
            const item = this.items.find(i => i.id == id);
            if (!item || !confirm(`Hapus item "${item.article}"?`)) return;
            try {
                await this.fetchWithAuth(`/api/items/${id}`, { method: 'DELETE' });
                await this.loadItems();
                this.showNotificationMessage('Item berhasil dihapus', 'success');
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Gagal menghapus data: ' + err.message, 'error');
            }
        },

        // ========== DETAIL UPDATE QTY ==========
        openQtyDetailModal(item) {
            this.selectedItemForQtyUpdate = { ...item };
            this.qtyUpdateDetail = { method: 'adjust', newQty: item.qty, adjustment: 0, changeType: 'adjustment', notes: '' };
            this.showQtyDetailModal = true;
        },

        async submitQtyDetailUpdate() {
            if (!this.selectedItemForQtyUpdate) return;
            this.qtyUpdateLoading = true;
            try {
                const payload = {
                    changeType: this.qtyUpdateDetail.changeType || 'adjustment',
                    notes: this.qtyUpdateDetail.notes || 'Qty updated',
                    updatedBy: this.user.username
                };
                if (this.qtyUpdateDetail.method === 'adjust') {
                    const adj = parseInt(this.qtyUpdateDetail.adjustment || 0);
                    if (adj === 0) throw new Error('Adjustment tidak boleh 0');
                    payload.adjustment = adj;
                } else {
                    const nq = parseInt(this.qtyUpdateDetail.newQty || 0);
                    if (nq < 0) throw new Error('Qty tidak boleh negatif');
                    payload.newQty = nq;
                }
                const response = await this.fetchWithAuth(`/api/items/${this.selectedItemForQtyUpdate.id}/update-qty`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                await this.loadItems();
                await this.loadRecentActivities();
                this.showQtyDetailModal = false;
                this.showNotificationMessage(result.message, 'success');
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Gagal update qty: ' + err.message, 'error');
            } finally {
                this.qtyUpdateLoading = false;
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
                if (this.historyFilter.limit) url += `?limit=${this.historyFilter.limit}`;
                let history = await (await this.fetchWithAuth(url)).json();
                if (this.historyFilter.changeType) {
                    history = history.filter(h => h.changeType === this.historyFilter.changeType);
                }
                if (this.historyFilter.startDate) {
                    const start = new Date(this.historyFilter.startDate);
                    start.setHours(0, 0, 0, 0);
                    history = history.filter(h => new Date(h.createdAt) >= start);
                }
                this.qtyHistory = history;
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Gagal memuat riwayat: ' + err.message, 'error');
            } finally {
                this.qtyHistoryLoading = false;
            }
        },

        getHistoryCountByType(type) {
            return this.qtyHistory.filter(h => h.changeType === type).length;
        },

        // ========== EXPORT RIWAYAT QTY KE EXCEL ==========
        async exportQtyHistory() {
            if (!this.canManageItems) return;
            if (!this.selectedItemForHistory || this.qtyHistory.length === 0) {
                this.showNotificationMessage('Tidak ada data riwayat untuk diexport', 'error');
                return;
            }

            try {
                const response = await this.fetchWithAuth('/api/export/qty-history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        itemId: this.selectedItemForHistory.id,
                        changeType: this.historyFilter.changeType || undefined,
                        startDate: this.historyFilter.startDate || undefined
                    })
                });

                if (!response.ok) throw new Error('Gagal export riwayat');

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `qty-history-${this.selectedItemForHistory.article}-${new Date().toISOString().split('T')[0]}.xlsx`;
                a.click();
                window.URL.revokeObjectURL(url);
                this.showNotificationMessage('Riwayat berhasil diexport', 'success');
            } catch (err) {
                this.showNotificationMessage('Gagal export: ' + err.message, 'error');
            }
        },

        // ========== LABEL (hanya admin) ==========
openLabelModal(item) {
    if (!this.canManageItems) return;
    this.selectedItemForLabel = { ...item };
    this.labelCopies = 1;
    this.labelSize = 'large';          // dipaksa besar
    this.labelShowQR = true;           // QR selalu tampil
    this.labelShowBarcode = true;      // barcode selalu tampil
    this.showLabelModal = true;
},

async printLabels() {
    if (!this.selectedItemForLabel) return;
    // paksa ke ukuran besar dan detail lengkap
    this.labelSize = 'large';
    this.labelShowQR = true;
    this.labelShowBarcode = true;

    const item = this.selectedItemForLabel;
    try {
        const response = await this.fetchWithAuth('/api/labels/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemIds: [item.id] })
        });
        if (!response.ok) throw new Error('Gagal mengambil data label');
        const result = await response.json();
        if (!result.success || !result.labels || result.labels.length === 0)
            throw new Error('Data label tidak valid');

        const labelData = result.labels[0];

        const labelSize = {
            small: { width: '2in', height: '1in', fontSize: '8px' },
            medium: { width: '3in', height: '2in', fontSize: '10px' },
            large: { width: '4in', height: '3in', fontSize: '12px' }
        }[this.labelSize];  // sekarang selalu large

        const qrSize = {
            small: '0.7in',
            medium: '0.9in',
            large: '1.2in'
        }[this.labelSize];

        const printWindow = window.open('', '_blank');
        let labelsHTML = '';

        for (let i = 0; i < this.labelCopies; i++) {
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
                                ${labelData.article}
                            </h4>
                            <p style="margin: 0.03in 0; color: #555;">${labelData.komponen}</p>
                            <p style="margin: 0.02in 0;">ID: ${labelData.id} | Lokasi: ${labelData.kolom || '-'}</p>
                            <p style="margin: 0.02in 0;">Kategori: ${labelData.category || '-'}</p>
                             <p style="margin: 0.02in 0;">Tanggal: ${new Date().toLocaleDateString('id-ID')}</p>
                            <p style="margin: 0.02in 0;">PO: ${labelData.noPo || '-'} | Stok: ${labelData.qty} | Min: ${labelData.minStock}</p>
                        </div>
                        <div style="background: #f0f0f0; padding: 0.05in; margin: 0.05in 0; border-radius: 3px;">
                            <p style="margin: 0; font-weight: bold; font-size: 1.2em; letter-spacing: 1px;">
                                ${labelData.kolom || 'LOKASI'}
                            </p>
                        </div>
                        <div>
                            ${this.labelShowQR && labelData.qrCodeDataURL ? `
                            <div style="margin: 0.05in auto; text-align: center;">
                                <img src="${labelData.qrCodeDataURL}" alt="QR Code" 
                                     style="width: ${qrSize}; height: ${qrSize}; image-rendering: crisp-edges;">
                            </div>
                            ` : ''}
                            ${this.labelShowBarcode ? `
                          
                            ` : ''}
                      
                        </div>
                    </div>
                </div>
            `;
        }

        const columns = { small: 4, medium: 3, large: 2 }[this.labelSize];

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Label - ${labelData.article}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        body { font-family: 'Inter', Arial, sans-serif; margin: 0.25in; padding: 0; background: white; }
                        @media print { 
                            body { margin: 0 !important; padding: 0 !important; }
                            .label { border: 1px solid #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .no-print { display: none !important; }
                            @page { margin: 0.25in; size: letter; }
                        }
                        .label-container { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 0.1in; width: 100%; }
                        .controls { background: #f5f5f5; padding: 10px; margin-bottom: 10px; border-radius: 5px; position: sticky; top: 0; z-index: 100; }
                        button { padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 14px; margin-right: 10px; }
                        button.close-btn { background: #f44336; }
                        .summary { background: #e8f5e9; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
                    </style>
                </head>
                <body>
                    <div class="controls no-print">
                        <div class="summary">
                            <h3>Label untuk: ${labelData.article}</h3>
                            <p>Jumlah label: ${this.labelCopies} | Ukuran: ${this.labelSize}</p>
                        </div>
                        <button onclick="window.print()"><i class="fas fa-print"></i> Print Labels</button>
                        <button onclick="window.close()" class="close-btn"><i class="fas fa-times"></i> Close</button>
                    </div>
                    <div class="label-container">${labelsHTML}</div>
                    <div class="no-print" style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
                        <p>Warehouse Management System v5.1 - Label</p>
                        <p>Generated: ${new Date().toLocaleString('id-ID')}</p>
                    </div>
                    <script>
                        window.onafterprint = function() { setTimeout(() => window.close(), 1000); };
                    <\/script>
                </body>
            </html>
        `);
        printWindow.document.close();
        this.showLabelModal = false;
        this.showNotificationMessage(`Label untuk ${labelData.article} siap dicetak`, 'success');
    } catch (err) {
        console.error('Error printing labels:', err);
        this.showNotificationMessage('Gagal mencetak label: ' + err.message, 'error');
    }
},

openBulkLabelModal() {
    if (!this.canManageItems) return;
    this.selectedItemsForBulkLabel = [];
    this.bulkLabelCopies = 1;
    this.bulkLabelFormat = 'detailed';   // selalu detailed
    this.bulkLabelSize = 'large';        // selalu besar
    this.showBulkLabelModal = true;
},

        toggleSelectAllBulkLabels() {
            if (this.selectedItemsForBulkLabel.length === this.items.length) {
                this.selectedItemsForBulkLabel = [];
            } else {
                this.selectedItemsForBulkLabel = this.items.map(item => item.id);
            }
        },

async printBulkLabels() {
    // paksa format dan ukuran
    this.bulkLabelSize = 'large';
    this.bulkLabelFormat = 'detailed';

    const selectedItems = this.items.filter(item => this.selectedItemsForBulkLabel.includes(item.id));
    if (selectedItems.length === 0) {
        this.showNotificationMessage('Pilih minimal satu item untuk label', 'error');
        return;
    }
    try {
        const response = await this.fetchWithAuth('/api/labels/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemIds: selectedItems.map(item => item.id) })
        });
        if (!response.ok) throw new Error('Gagal mengambil data label');
        const result = await response.json();
        if (!result.success || !result.labels) throw new Error('Data label tidak valid');

        const labelSize = {
            small: { width: '2in', height: '1in', fontSize: '8px' },
            medium: { width: '3in', height: '2in', fontSize: '10px' },
            large: { width: '4in', height: '3in', fontSize: '12px' }
        }[this.bulkLabelSize];

        const qrSize = {
            small: '0.7in',
            medium: '0.9in',
            large: '1.2in'
        }[this.bulkLabelSize];

        const printWindow = window.open('', '_blank');
        let labelsHTML = '';

        result.labels.forEach((label, idx) => {
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
                                <p style="margin: 0.03in 0; color: #555;">${label.komponen}</p>
                                <p style="margin: 0.02in 0;">ID: ${label.id} | Lokasi: ${label.kolom || '-'}</p>
                                <p style="margin: 0.02in 0;">Kategori: ${label.category || '-'}</p>
                                <p style="margin: 0.02in 0;">Tanggal: ${new Date(label.timestamp || Date.now()).toLocaleDateString('id-ID')}</p>
                                <p style="margin: 0.02in 0;">PO: ${label.noPo || '-'} | Stok: ${label.qty} | Min: ${label.minStock}</p>
                            </div>
                            <div style="background: #f0f0f0; padding: 0.05in; margin: 0.05in 0; border-radius: 3px;">
                                <p style="margin: 0; font-weight: bold; font-size: 1.2em; letter-spacing: 1px;">
                                    ${label.kolom || 'LOKASI'}
                                </p>
                            </div>
                            <div>
                                ${this.bulkLabelFormat !== 'simple' && label.qrCodeDataURL ? `
                                <div style="margin: 0.05in auto; text-align: center;">
                                    <img src="${label.qrCodeDataURL}" alt="QR Code" 
                                         style="width: ${qrSize}; height: ${qrSize}; image-rendering: crisp-edges;">
                                </div>
                                ` : ''}
                                ${this.bulkLabelFormat === 'detailed' ? `
                               
                                ` : ''}
                             
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        const columns = { small: 4, medium: 3, large: 2 }[this.bulkLabelSize];

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Label Massal - ${selectedItems.length} items</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        body { font-family: 'Inter', Arial, sans-serif; margin: 0.25in; padding: 0; background: white; }
                        @media print { 
                            body { margin: 0 !important; padding: 0 !important; }
                            .label { border: 1px solid #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .no-print { display: none !important; }
                            @page { margin: 0.25in; size: letter; }
                        }
                        .label-container { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 0.1in; width: 100%; }
                        .controls { background: #f5f5f5; padding: 10px; margin-bottom: 10px; border-radius: 5px; position: sticky; top: 0; z-index: 100; }
                        button { padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 14px; margin-right: 10px; }
                        button.close-btn { background: #f44336; }
                        .summary { background: #e8f5e9; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
                    </style>
                </head>
                <body>
                    <div class="controls no-print">
                        <div class="summary">
                            <h3>Label Massal</h3>
                            <p>Jumlah Item: ${selectedItems.length} | Label per Item: ${this.bulkLabelCopies} | Total Label: ${selectedItems.length * this.bulkLabelCopies}</p>
                            <p>Format: ${this.bulkLabelFormat} | Ukuran: ${this.bulkLabelSize}</p>
                        </div>
                        <button onclick="window.print()"><i class="fas fa-print"></i> Print All Labels</button>
                        <button onclick="window.close()" class="close-btn"><i class="fas fa-times"></i> Close</button>
                    </div>
                    <div class="label-container">${labelsHTML}</div>
                    <div class="no-print" style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
                        <p>Warehouse Management System v5.1 - Label Massal</p>
                        <p>Generated: ${new Date().toLocaleString('id-ID')}</p>
                    </div>
                    <script>
                        window.onafterprint = function() { setTimeout(() => window.close(), 1000); };
                    <\/script>
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

        // ========== EXPORT SEMUA ITEM KE EXCEL ==========
        async exportToExcel() {
            if (!this.canManageItems) return;
            if (this.items.length === 0) { this.showNotificationMessage('Tidak ada data', 'error'); return; }
            try {
                const res = await this.fetchWithAuth('/api/export/excel');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `warehouse-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                a.click();
                window.URL.revokeObjectURL(url);
                this.showNotificationMessage('Export berhasil', 'success');
            } catch (err) {}
        },

        // ========== FILTER & UTILITY ==========
        applyFilter() { this.currentPage = 1; this.loadItems(); },
        clearFilter() {
            this.filter = { kolom: '', komponen: '', search: '' };
            this.showLowStock = false;
            this.tableSearch = '';
            this.currentPage = 1;
            this.loadItems();
        },
        sortTable(field) {
            if (this.sortField === field) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            else { this.sortField = field; this.sortDirection = 'asc'; }
        },
        previousPage() { if (this.currentPage > 1) this.currentPage--; },
        nextPage() { if (this.currentPage * this.itemsPerPage < this.filteredItems.length) this.currentPage++; },

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

        openPrintView() {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html><head><title>Warehouse Report - ${new Date().toLocaleDateString()}</title>
                <style>body{font-family:Arial,sans-serif;margin:20px;}h1{color:#333;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f2f2f2;}.low-stock{background-color:#ffe6e6;}@media print{.no-print{display:none;}}</style>
                </head><body><h1>Warehouse Report</h1><p>Generated: ${new Date().toLocaleString()}</p>
                <p>Total Items: ${this.items.length}</p><p>Low Stock Items: ${this.lowStockCount}</p><p>QR Scans Today: ${this.todayScanCount}</p>
                <table><thead><tr><th>ID</th><th>Article</th><th>Komponen</th><th>Kategori</th><th>Qty</th><th>Min Stock</th><th>Lokasi</th><th>Status</th></tr></thead><tbody>
                ${this.items.map(item => `<tr class="${item.qty <= item.minStock ? 'low-stock' : ''}"><td>${item.id}</td><td>${item.article}</td><td>${item.komponen}</td><td>${item.Category?.name || '-'}</td><td>${item.qty}</td><td>${item.minStock}</td><td>${item.kolom || '-'}</td><td>${item.qty <= item.minStock ? 'LOW STOCK' : 'OK'}</td></tr>`).join('')}
                </tbody></table><div class="no-print" style="margin-top:20px;"><button onclick="window.print()">Print Report</button><button onclick="window.close()">Close</button></div>
                </body></html>
            `);
            printWindow.document.close();
        },

        openScanLogs() { this.showScanLogs = true; this.loadScanLogs(); },
        toggleActivityView() { this.showScanLogs = !this.showScanLogs; },

        formatNumber(num) { return new Intl.NumberFormat('id-ID').format(num); },
        formatDateTime(dateString) { const d = new Date(dateString); return d.toLocaleDateString('id-ID') + ' ' + d.toLocaleTimeString('id-ID'); },
        formatTimeAgo(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            const diff = Math.floor((new Date() - date) / 60000);
            if (diff < 1) return 'baru saja';
            if (diff < 60) return `${diff} menit lalu`;
            if (diff < 1440) return `${Math.floor(diff / 60)} jam lalu`;
            return `${Math.floor(diff / 1440)} hari lalu`;
        },

        showNotificationMessage(message, type = 'success') {
            this.notificationMessage = message;
            this.notificationType = type;
            this.showNotification = true;
            setTimeout(() => { this.showNotification = false; }, 3000);
        }
    };
}