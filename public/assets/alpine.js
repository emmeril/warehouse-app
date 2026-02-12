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
        currentItem: { id: null, article: '', komponen: '', noPo: '', order: 0, qty: 0, minStock: 10, kolom: '' },
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

        // ========== COMPUTED ==========
        get isAuthenticated() {
            return this.user !== null;
        },
        get isAdmin() {
            return this.user?.role === 'admin';
        },
        get isOperator() {
            return this.user?.role === 'operator';
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
                    (item.kolom && item.kolom.toLowerCase().includes(search))
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
                this.loadUniqueValues()
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
                        scannedBy: this.user.username   // AUTO dari session
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
                this.showNotificationMessage(this.currentItem.id ? 'Item berhasil diperbarui' : 'Item baru berhasil ditambahkan', 'success');
            } catch (err) {
                if (err.message !== 'Unauthorized')
                    this.showNotificationMessage('Gagal menyimpan data: ' + err.message, 'error');
            } finally {
                this.savingItem = false;
            }
        },

        editItem(item) { this.currentItem = { ...item }; document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' }); },
        duplicateItem(item) { this.currentItem = { ...item, id: null, article: item.article + ' (Copy)' }; document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' }); },
        resetForm() { this.currentItem = { id: null, article: '', komponen: '', noPo: '', order: 0, qty: 0, minStock: 10, kolom: '' }; },

        async deleteItem(id) {
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
                    updatedBy: this.user.username   // AUTO dari session
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

        async exportQtyHistory() {
            if (!this.isAdmin) return;
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

        // ========== LABEL (hanya admin) ==========
        openLabelModal(item) {
            if (this.isAdmin) {
                this.selectedItemForLabel = { ...item };
                this.labelCopies = 1;
                this.labelSize = 'medium';
                this.labelShowQR = true;
                this.labelShowBarcode = true;
                this.showLabelModal = true;
            }
        },

        async printLabels() {
            if (!this.selectedItemForLabel) return;
            const item = this.selectedItemForLabel;
            try {
                let qrCodeURL = '';
                if (this.labelShowQR) {
                    const qrResponse = await this.fetchWithAuth(`/api/items/${item.id}/label-qrcode`);
                    if (qrResponse.ok) {
                        const blob = await qrResponse.blob();
                        qrCodeURL = URL.createObjectURL(blob);
                    }
                }

                const printWindow = window.open('', '_blank');
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
                                    ${new Date().toLocaleDateString('id-ID')} | WMS v5.1
                                </p>
                            </div>
                        </div>
                    `;
                }

                const columns = { small: 4, medium: 3, large: 2 }[this.labelSize];

                printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <title>Label - ${item.article}</title>
                            <style>
                                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                                body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 0.25in; background: white; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                                @media print { 
                                    body { padding: 0 !important; margin: 0 !important; }
                                    .label { border: 1px solid #000 !important; margin: 0.1in !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                    .no-print { display: none !important; }
                                    @page { margin: 0.25in; size: letter; }
                                }
                                .label-container { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 0.1in; width: 100%; }
                                .controls { background: #f5f5f5; padding: 10px; margin-bottom: 10px; border-radius: 5px; position: sticky; top: 0; z-index: 100; }
                                button { padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 14px; margin-right: 10px; }
                                button.close-btn { background: #f44336; }
                                button.close-btn:hover { background: #da190b; }
                            </style>
                        </head>
                        <body>
                            <div class="controls no-print">
                                <h3>Label untuk: ${item.article}</h3>
                                <p>Jumlah label: ${this.labelCopies} | Ukuran: ${this.labelSize} | ID Item: ${item.id}</p>
                                <button onclick="window.print()"><i class="fas fa-print"></i> Print Labels</button>
                                <button onclick="window.close()" class="close-btn"><i class="fas fa-times"></i> Close</button>
                            </div>
                            <div class="label-container">${labelsHTML}</div>
                            <script>
                                window.onafterprint = function() { setTimeout(() => window.close(), 1000); };
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
            if (this.isAdmin) {
                this.selectedItemsForBulkLabel = [];
                this.bulkLabelCopies = 1;
                this.bulkLabelFormat = 'standard';
                this.bulkLabelSize = 'medium';
                this.showBulkLabelModal = true;
            }
        },

        toggleSelectAllBulkLabels() {
            if (this.selectedItemsForBulkLabel.length === this.items.length) {
                this.selectedItemsForBulkLabel = [];
            } else {
                this.selectedItemsForBulkLabel = this.items.map(item => item.id);
            }
        },

        async printBulkLabels() {
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
                                            WMS v5.1 | ${idx + 1}/${result.count}
                                        </p>
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
                                    <p>Format: ${this.bulkLabelFormat} | Ukuran: ${this.bulkLabelSize} | Kolom per halaman: ${columns}</p>
                                </div>
                                <button onclick="window.print()"><i class="fas fa-print"></i> Print All Labels (${selectedItems.length * this.bulkLabelCopies})</button>
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

        async exportToCSV() {
            if (!this.isAdmin) return;
            if (this.items.length === 0) { this.showNotificationMessage('Tidak ada data', 'error'); return; }
            try {
                const res = await this.fetchWithAuth('/api/export/csv');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `warehouse-export-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
                this.showNotificationMessage('Export berhasil', 'success');
            } catch (err) {}
        },

        openPrintView() {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html><head><title>Warehouse Report - ${new Date().toLocaleDateString()}</title>
                <style>body{font-family:Arial,sans-serif;margin:20px;}h1{color:#333;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background-color:#f2f2f2;}.low-stock{background-color:#ffe6e6;}@media print{.no-print{display:none;}}</style>
                </head><body><h1>Warehouse Report</h1><p>Generated: ${new Date().toLocaleString()}</p>
                <p>Total Items: ${this.items.length}</p><p>Low Stock Items: ${this.lowStockCount}</p><p>QR Scans Today: ${this.todayScanCount}</p>
                <table><thead><tr><th>ID</th><th>Article</th><th>Komponen</th><th>Qty</th><th>Min Stock</th><th>Lokasi</th><th>Status</th></tr></thead><tbody>
                ${this.items.map(item => `<tr class="${item.qty <= item.minStock ? 'low-stock' : ''}"><td>${item.id}</td><td>${item.article}</td><td>${item.komponen}</td><td>${item.qty}</td><td>${item.minStock}</td><td>${item.kolom || '-'}</td><td>${item.qty <= item.minStock ? 'LOW STOCK' : 'OK'}</td></tr>`).join('')}
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