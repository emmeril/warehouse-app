// Warehouse Management App - Alpine.js v5.4
// Menambahkan fitur Import Excel (admin only)

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
        itemTotal: 0,
        availableLocations: [],
        availableKomponen: [],
        currentItem: { id: null, article: '', komponen: '', noPo: '', order: 0, qty: 0, minStock: 10, kolom: '', categoryId: null },
        filter: {
            kolom: '',
            komponen: '',
            search: '',
            categoryId: null,
            stockStatus: '',
            minQty: null,
            maxQty: null,
            noPo: ''
        },
        loading: false,
        error: '',
        showNotification: false,
        notificationMessage: '',
        notificationType: 'success',
        showLowStock: false,
        dataSyncTimer: null,
        dataSyncVersion: null,
        dataSyncPollingMs: 5000,
        dataSyncInFlight: false,

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
        itemsPerPage: 10,

        // Loading states
        savingItem: false,
        qtyUpdateLoading: false,
        qtyHistoryLoading: false,
        bulkUpdateLoading: false,
        bulkDeleteLoading: false,

        // Label
        showLabelModal: false,
        showBulkLabelModal: false,
        showBulkDeleteModal: false,
        selectedItemForLabel: null,
        selectedItemsForBulkLabel: [],
        selectedItemsForBulkDelete: [],
        bulkDeletePreviewItems: [],
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
        newUser: { username: '', password: '', role: 'operator', categoryId: null },
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

        // Filter items dengan semua kriteria (client-side)
        get filteredItems() {
            let filtered = this.items;
            if (this.filter.stockStatus) {
                switch (this.filter.stockStatus) {
                    case 'low':
                        filtered = filtered.filter(item => item.qty <= item.minStock);
                        break;
                    case 'medium':
                        filtered = filtered.filter(item => item.qty > item.minStock && item.qty <= item.minStock * 2);
                        break;
                    case 'safe':
                        filtered = filtered.filter(item => item.qty > item.minStock * 2);
                        break;
                }
            }
            if (this.filter.minQty !== null && this.filter.minQty !== '') {
                const min = parseInt(this.filter.minQty);
                if (!isNaN(min)) filtered = filtered.filter(item => item.qty >= min);
            }
            if (this.filter.maxQty !== null && this.filter.maxQty !== '') {
                const max = parseInt(this.filter.maxQty);
                if (!isNaN(max)) filtered = filtered.filter(item => item.qty <= max);
            }

            return filtered;
        },

        get filteredAndSortedItems() {
            const items = [...this.filteredItems];
            const start = (this.currentPage - 1) * this.itemsPerPage;
            return items.slice(start, start + this.itemsPerPage);
        },
        get totalQty() {
            return this.stats.totalQty ?? this.items.reduce((sum, item) => sum + parseInt(item.qty || 0), 0);
        },
        get totalOrder() {
            return this.stats.totalOrder ?? this.items.reduce((sum, item) => sum + parseInt(item.order || 0), 0);
        },
        get uniqueLocations() {
            return this.uniqueLocationsList.length;
        },
        get uniqueLocationsList() {
            const source = this.availableLocations.length
                ? this.availableLocations
                : [...new Set(this.items.map(item => item.kolom).filter(Boolean))];
            return [...new Set(source)].sort();
        },
        get uniqueKomponenList() {
            const source = this.availableKomponen.length
                ? this.availableKomponen
                : [...new Set(this.items.map(item => item.komponen).filter(Boolean))];
            return [...new Set(source)].sort();
        },
        get lowStockCount() {
            return this.stats.lowStockItems ?? this.items.filter(item => item.qty <= item.minStock).length;
        },
        get itemsWithNoPo() {
            return this.items.filter(item => item.noPo && item.noPo.trim() !== '').length;
        },

        // ========== INIT ==========
        async init() {
            await this.initAuth();
            if (this.isAuthenticated) {
                await this.loadInitialData();
                this.startDataSyncPolling();
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
                this.loadRecentActivities(),
                this.loadScanLogs(),
                this.loadUniqueValues(),
                this.loadCategories()
            ]);
            await this.loadStats();
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
                this.selectedItemsForBulkDelete = [];
                this.bulkDeletePreviewItems = [];
                this.showBulkDeleteModal = false;
                await this.loadInitialData();
                this.startDataSyncPolling();
            } catch (err) {
                this.loginError = err.message;
            } finally {
                this.loginLoading = false;
            }
        },

        async logout() {
            try {
                await fetch('/api/logout', { method: 'POST' });
                this.stopDataSyncPolling();
                this.user = null;
                this.items = [];
                this.recentActivities = [];
                this.recentScans = [];
                this.selectedItemsForBulkDelete = [];
                this.bulkDeletePreviewItems = [];
                this.showBulkDeleteModal = false;
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
                this.newUser = { username: '', password: '', role: 'operator', categoryId: null };
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
            this.newUser = { username: '', password: '', role: 'operator', categoryId: null };
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
                const searchTerm = this.tableSearch.trim() || this.filter.search.trim();
                if (this.filter.kolom) params.push(`kolom=${encodeURIComponent(this.filter.kolom)}`);
                if (this.filter.komponen) params.push(`komponen=${encodeURIComponent(this.filter.komponen)}`);
                if (this.filter.categoryId) params.push(`categoryId=${encodeURIComponent(this.filter.categoryId)}`);
                if (searchTerm) params.push(`search=${encodeURIComponent(searchTerm)}`);
                if (this.showLowStock) params.push('lowStock=true');
                if (this.sortField) params.push(`sortBy=${encodeURIComponent(this.sortField)}`);
                params.push(`sortOrder=${this.sortDirection}`);
                params.push(`limit=${Math.max(this.itemsPerPage * 100, 1000)}`);
                if (params.length) url += '?' + params.join('&');
                const response = await this.fetchWithAuth(url);
                const data = await response.json();
                this.items = Array.isArray(data) ? data : data.items || [];
                this.itemTotal = Array.isArray(data) ? this.items.length : (data.total ?? this.items.length);
                this.clearBulkDeleteSelection();
            } catch (err) {
                if (err.message !== 'Unauthorized') {
                    this.error = err.message;
                    this.showNotificationMessage('Gagal memuat data: ' + err.message, 'error');
                }
            } finally {
                this.loading = false;
            }
        },

        async loadItemsForSync() {
            if (!this.isAuthenticated) return;
            try {
                let url = '/api/items';
                const params = [];
                const searchTerm = this.tableSearch.trim() || this.filter.search.trim();
                if (this.filter.kolom) params.push(`kolom=${encodeURIComponent(this.filter.kolom)}`);
                if (this.filter.komponen) params.push(`komponen=${encodeURIComponent(this.filter.komponen)}`);
                if (this.filter.categoryId) params.push(`categoryId=${encodeURIComponent(this.filter.categoryId)}`);
                if (searchTerm) params.push(`search=${encodeURIComponent(searchTerm)}`);
                if (this.showLowStock) params.push('lowStock=true');
                if (this.sortField) params.push(`sortBy=${encodeURIComponent(this.sortField)}`);
                params.push(`sortOrder=${this.sortDirection}`);
                params.push(`limit=${Math.max(this.itemsPerPage * 100, 1000)}`);
                if (params.length) url += '?' + params.join('&');
                const response = await this.fetchWithAuth(url);
                const data = await response.json();
                this.items = Array.isArray(data) ? data : data.items || [];
                this.itemTotal = Array.isArray(data) ? this.items.length : (data.total ?? this.items.length);
            } catch (err) {
                if (err.message !== 'Unauthorized') {
                    console.warn('Auto sync items failed:', err.message);
                }
            }
        },

        async loadStats() {
            if (!this.isAuthenticated) return;
            try {
                const res = await this.fetchWithAuth('/api/dashboard/stats');
                this.stats = await res.json();
                const today = new Date().toDateString();
                const scans = this.recentScans.length ? this.recentScans : (this.stats.recentScans || []);
                this.todayScanCount = scans.filter(scan => 
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
                const res = await this.fetchWithAuth('/api/unique-values');
                const data = await res.json();
                this.availableKomponen = Array.isArray(data.komponen) ? data.komponen : [];
                this.availableLocations = Array.isArray(data.kolom) ? data.kolom : [];
            } catch (err) {}
        },

        stopDataSyncPolling() {
            if (this.dataSyncTimer) {
                clearInterval(this.dataSyncTimer);
                this.dataSyncTimer = null;
            }
            this.dataSyncVersion = null;
            this.dataSyncInFlight = false;
        },

        async startDataSyncPolling() {
            this.stopDataSyncPolling();
            if (!this.isAuthenticated) return;

            try {
                const res = await this.fetchWithAuth('/api/data-sync');
                const state = await res.json();
                this.dataSyncVersion = state.version;
            } catch (err) {}

            this.dataSyncTimer = setInterval(() => {
                this.checkDataSync();
            }, this.dataSyncPollingMs);
        },

        async refreshLiveData() {
            if (!this.isAuthenticated) return;
            await Promise.all([
                this.loadItemsForSync(),
                this.loadStats(),
                this.loadRecentActivities(),
                this.loadScanLogs(),
                this.loadUniqueValues(),
                this.loadCategories(),
                this.isAdmin ? this.loadUsers() : Promise.resolve()
            ]);
        },

        async checkDataSync() {
            if (!this.isAuthenticated || this.dataSyncInFlight) return;
            this.dataSyncInFlight = true;

            try {
                const res = await this.fetchWithAuth('/api/data-sync');
                if (!res.ok) return;
                const state = await res.json();
                if (this.dataSyncVersion === null) {
                    this.dataSyncVersion = state.version;
                    return;
                }

                if (state.version !== this.dataSyncVersion) {
                    this.dataSyncVersion = state.version;
                    await this.refreshLiveData();
                }
            } catch (err) {
                // Abaikan error sementara. Sync berikutnya akan mencoba lagi.
            } finally {
                this.dataSyncInFlight = false;
            }
        },

        // ========== IMPORT EXCEL (ADMIN ONLY) ==========
        importExcel() {
            document.getElementById('excelImportInput').click();
        },

        async handleExcelImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            event.target.value = '';

            const formData = new FormData();
            formData.append('file', file);

            this.showNotificationMessage('Mengupload dan memproses file...', 'info');
            try {
                const res = await this.fetchWithAuth('/api/import/excel', {
                    method: 'POST',
                    body: formData
                });

                const result = await res.json();
                if (!res.ok) {
                    let errorMsg = result.error || 'Gagal import';
                    if (result.details) {
                        errorMsg += '\n' + result.details.join('\n');
                    }
                    throw new Error(errorMsg);
                }

                this.showNotificationMessage(result.message, 'success');
                await this.loadItems();
            } catch (err) {
                this.showNotificationMessage(err.message, 'error');
            }
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
                if (!response.ok) {
                    throw new Error(result.error || result.message || 'Gagal memproses QR Code');
                }
                this.lastScanTime = new Date().toISOString();
                if (result.success && result.items?.length) {
                    this.scannedItems = result.items;
                    this.scannedItem = result.items[0];
                    await this.loadScanLogs();
                    this.showNotificationMessage(`Item ditemukan: ${this.scannedItem.article}`, 'success');
                } else {
                    this.showNotificationMessage(result.message || 'Item tidak ditemukan', 'error');
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

        resetForm() {
            this.currentItem = { 
                id: null, 
                article: '', 
                komponen: '', 
                noPo: '', 
                order: 0, 
                qty: 0, 
                minStock: 10, 
                kolom: '', 
                categoryId: this.isAdmin ? null : (this.user?.categoryId || null) 
            };
        },

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

        clearBulkDeleteSelection() {
            this.selectedItemsForBulkDelete = [];
            this.bulkDeletePreviewItems = [];
        },

        toggleSelectAllBulkDelete() {
            const visibleIds = this.filteredAndSortedItems.map(item => String(item.id));
            const selectedIds = this.selectedItemsForBulkDelete.map(id => String(id));
            const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
            if (allSelected) {
                this.selectedItemsForBulkDelete = selectedIds.filter(id => !visibleIds.includes(id));
            } else {
                this.selectedItemsForBulkDelete = [...new Set([...selectedIds, ...visibleIds])];
            }
        },

        isBulkDeleteVisibleSelected() {
            const visibleIds = this.filteredAndSortedItems.map(item => String(item.id));
            const selectedIds = this.selectedItemsForBulkDelete.map(id => String(id));
            return visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
        },

        getBulkDeleteVisibleSelectedCount() {
            const visibleIds = this.filteredAndSortedItems.map(item => String(item.id));
            const selectedIds = new Set(this.selectedItemsForBulkDelete.map(id => String(id)));
            return visibleIds.filter(id => selectedIds.has(id)).length;
        },

        isBulkDeleteItemSelected(itemId) {
            return this.selectedItemsForBulkDelete.map(id => String(id)).includes(String(itemId));
        },

        openBulkDeleteModal() {
            if (!this.isAdmin) return;
            const selectedIds = this.selectedItemsForBulkDelete.map(id => String(id));
            const visibleIds = this.filteredAndSortedItems.map(item => String(item.id));
            this.bulkDeletePreviewItems = this.items.filter(item =>
                selectedIds.includes(String(item.id)) && visibleIds.includes(String(item.id))
            );
            if (this.bulkDeletePreviewItems.length === 0) {
                this.showNotificationMessage('Pilih minimal satu item pada halaman ini untuk dihapus', 'error');
                return;
            }
            this.showBulkDeleteModal = true;
        },

        closeBulkDeleteModal() {
            this.showBulkDeleteModal = false;
            this.bulkDeletePreviewItems = [];
        },

        async confirmBulkDelete() {
            if (!this.isAdmin) return;
            const selectedItems = this.bulkDeletePreviewItems.filter(item =>
                this.selectedItemsForBulkDelete.map(id => String(id)).includes(String(item.id))
            );
            if (selectedItems.length === 0) {
                this.showNotificationMessage('Pilih minimal satu item pada halaman ini untuk dihapus', 'error');
                return;
            }

            const previewNames = selectedItems.slice(0, 5).map(item => item.article).join(', ');
            const confirmMessage = selectedItems.length <= 5
                ? `Hapus ${selectedItems.length} item berikut?\n${previewNames}`
                : `Hapus ${selectedItems.length} item terpilih?`;
            if (!confirm(confirmMessage)) return;

            this.bulkDeleteLoading = true;
            try {
                const response = await this.fetchWithAuth('/api/items', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemIds: selectedItems.map(item => item.id) })
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || result.message || 'Gagal menghapus item');
                }

                this.clearBulkDeleteSelection();
                this.showBulkDeleteModal = false;
                await this.loadItems();
                await this.loadRecentActivities();
                this.showNotificationMessage(result.message || `${selectedItems.length} item berhasil dihapus`, 'success');
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Gagal menghapus item: ' + err.message, 'error');
            } finally {
                this.bulkDeleteLoading = false;
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
                if (!response.ok) {
                    throw new Error(result.error || result.message || 'Gagal update qty');
                }
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

        // ========== LABEL (hanya admin/staff) ==========
        openLabelModal(item) {
            if (!this.canManageItems) return;
            this.selectedItemForLabel = { ...item };
            this.labelCopies = 1;
            this.labelSize = 'large';
            this.labelShowQR = true;
            this.labelShowBarcode = true;
            this.showLabelModal = true;
        },

        async printLabels() {
            if (!this.selectedItemForLabel) return;
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
                const layout = this.getLabelLayout(this.labelSize);
                const labelsHTML = Array.from({ length: this.labelCopies }, () =>
                    this.buildLabelCard(labelData, {
                        size: this.labelSize,
                        showQR: this.labelShowQR,
                        showBarcode: this.labelShowBarcode
                    })
                ).join('');

                const printWindow = this.openLabelPrintWindow({
                    title: `Label - ${labelData.article}`,
                    summaryHtml: `
                        <h3>Label untuk: ${labelData.article}</h3>
                        <p>Jumlah label: ${this.labelCopies} | Ukuran: ${this.labelSize}</p>
                    `,
                    labelsHtml,
                    columns: layout.columns
                });
                if (!printWindow) return;
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
            this.bulkLabelFormat = 'detailed';
            this.bulkLabelSize = 'large';
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
                const layout = this.getLabelLayout(this.bulkLabelSize);
                const labelsHTML = result.labels.map(label => {
                    return Array.from({ length: this.bulkLabelCopies }, () =>
                        this.buildLabelCard(label, {
                            size: this.bulkLabelSize,
                            showQR: this.bulkLabelFormat !== 'simple',
                            showBarcode: this.bulkLabelFormat === 'detailed'
                        })
                    ).join('');
                }).join('');

                const printWindow = this.openLabelPrintWindow({
                    title: `Label Massal - ${selectedItems.length} items`,
                    summaryHtml: `
                        <h3>Label Massal</h3>
                        <p>Jumlah Item: ${selectedItems.length} | Label per Item: ${this.bulkLabelCopies} | Total Label: ${selectedItems.length * this.bulkLabelCopies}</p>
                        <p>Format: ${this.bulkLabelFormat} | Ukuran: ${this.bulkLabelSize}</p>
                    `,
                    labelsHtml,
                    columns: layout.columns
                });
                if (!printWindow) return;
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
        applyFilter() {
            this.currentPage = 1;
            this.clearBulkDeleteSelection();
            this.loadItems();
        },

        toggleLowStockFilter() {
            this.showLowStock = !this.showLowStock;
            this.currentPage = 1;
            this.clearBulkDeleteSelection();
            this.loadItems();
        },

        getLabelLayout(size) {
            const config = {
                small: { width: '2in', height: '1in', fontSize: '8px', qrSize: '0.7in', columns: 4 },
                medium: { width: '3in', height: '2in', fontSize: '10px', qrSize: '0.9in', columns: 3 },
                large: { width: '4in', height: '3in', fontSize: '12px', qrSize: '1.2in', columns: 2 }
            };
            return config[size] || config.medium;
        },

        openLabelPrintWindow({ title, summaryHtml, labelsHtml, columns }) {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                this.showNotificationMessage('Popup print diblokir browser', 'error');
                return null;
            }

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>${title}</title>
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
                                ${summaryHtml}
                            </div>
                            <button onclick="window.print()"><i class="fas fa-print"></i> Print</button>
                            <button onclick="window.close()" class="close-btn"><i class="fas fa-times"></i> Close</button>
                        </div>
                        <div class="label-container">${labelsHtml}</div>
                        <div class="no-print" style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
                            <p>Warehouse Management System v5.4 - Label</p>
                            <p>Generated: ${new Date().toLocaleString('id-ID')}</p>
                        </div>
                        <script>
                            window.onafterprint = function() { setTimeout(() => window.close(), 1000); };
                        <\/script>
                    </body>
                </html>
            `);
            printWindow.document.close();
            return printWindow;
        },

        buildLabelCard(label, options = {}) {
            const layout = this.getLabelLayout(options.size || 'medium');
            const showQR = options.showQR ?? true;
            const showBarcode = options.showBarcode ?? true;
            const extraFooter = options.extraFooter || '';

            return `
                <div class="label" style="
                    width: ${layout.width}; 
                    height: ${layout.height}; 
                    border: 1px solid #000; 
                    padding: 0.1in; 
                    margin: 0.1in; 
                    display: inline-block; 
                    vertical-align: top; 
                    page-break-inside: avoid; 
                    background: white; 
                    box-sizing: border-box;
                    font-size: ${layout.fontSize};
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
                            ${showQR && label.qrCodeDataURL ? `
                            <div style="margin: 0.05in auto; text-align: center;">
                                <img src="${label.qrCodeDataURL}" alt="QR Code" 
                                     style="width: ${layout.qrSize}; height: ${layout.qrSize}; image-rendering: crisp-edges;">
                            </div>
                            ` : ''}
                            ${showBarcode ? `
                            <!-- Barcode bisa ditambahkan jika diperlukan -->
                            ` : ''}
                            ${extraFooter}
                        </div>
                    </div>
                </div>
            `;
        },

        clearFilter() {
            this.filter = {
                kolom: '',
                komponen: '',
                search: '',
                categoryId: null,
                stockStatus: '',
                minQty: null,
                maxQty: null,
                noPo: ''
            };
            this.showLowStock = false;
            this.tableSearch = '';
            this.currentPage = 1;
            this.loadItems();
        },

        sortTable(field) {
            if (this.sortField === field) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            else { this.sortField = field; this.sortDirection = 'asc'; }
            this.currentPage = 1;
            this.clearBulkDeleteSelection();
            this.loadItems();
        },

        previousPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.clearBulkDeleteSelection();
            }
        },
        nextPage() {
            if (this.currentPage * this.itemsPerPage < this.filteredItems.length) {
                this.currentPage++;
                this.clearBulkDeleteSelection();
            }
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

        viewHistoryFromScan() {
            if (this.scannedItem) {
                this.openQtyHistoryModal(this.scannedItem);
            }
        },

        showNotificationMessage(message, type = 'success') {
            this.notificationMessage = message;
            this.notificationType = type;
            this.showNotification = true;
            setTimeout(() => { this.showNotification = false; }, 3000);
        }
    };
}
