// --- Core Application Logic for RR ENTERPRISE ---

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBxC-iuJvtorh6O6JvBmKbY2oBpEsFXah4",
    authDomain: "gen-lang-client-0915071340.firebaseapp.com",
    projectId: "gen-lang-client-0915071340",
    storageBucket: "gen-lang-client-0915071340.firebasestorage.app",
    messagingSenderId: "290897469764",
    appId: "1:290897469764:web:e6d3bf9b912e6526f73711",
    measurementId: "G-Y5V0R6NEW6",
    databaseURL: "https://gen-lang-client-0915071340-default-rtdb.firebaseio.com"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const STORAGE_KEY = 'rr_enterprise_data';

// Default initial state
const defaultState = {
    inventory: [], // {id, name, buyPrice, sellPrice, stock, minStock}
    customers: [], // {id, name, phone, totalPurchased, pendingDues, lastPurchase}
    bills: [], // {id, date, customerId, items: [], subtotal, gst, total, paidAmount, payMethod}
    expenses: [], // {id, date, desc, amount}
    loans: [], // {id, provider, amount, dueDate, status}
};

class StorageManager {
    static init(callback) {
        // Fallback: load local while waiting for cloud
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData && !this.firstCloudLoad) {
            callback(JSON.parse(localData), false);
        }

        const dbRef = db.ref(STORAGE_KEY);
        dbRef.on('value', (snapshot) => {
            this.firstCloudLoad = true;
            const data = snapshot.val();
            if (!data) {
                this.saveData(defaultState);
                callback(defaultState, true);
            } else {
                const sanitized = {
                    inventory: data.inventory || [],
                    customers: data.customers || [],
                    bills: data.bills || [],
                    expenses: data.expenses || [],
                    loans: data.loans || []
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
                callback(sanitized, true);
            }
        }, (error) => {
            console.error("Firebase Read Error:", error);
            // If cloud fails (e.g. permission denied), fallback to local storage
            if (!this.firstCloudLoad) {
                const localData = localStorage.getItem(STORAGE_KEY);
                alert("Could not connect to Cloud Database. Loading offline data instead.\n\nError: " + error.message);
                callback(localData ? JSON.parse(localData) : defaultState, false);
                this.firstCloudLoad = true;
            }
        });
    }

    static saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        db.ref(STORAGE_KEY).set(data);
    }

    static generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

class App {
    constructor() {
        this.currentCart = [];
        this.initialized = false;
        
        document.getElementById('page-title').textContent = "Syncing with Cloud...";
        
        StorageManager.init((data, isCloud) => {
            this.data = data;
            
            if (!this.initialized) {
                this.init();
                this.initialized = true;
            } else if (isCloud) {
                // Re-render the active view with new cloud data
                const activeBtn = document.querySelector('.nav-item.active');
                if (activeBtn) {
                    this.navigate(activeBtn.getAttribute('data-target'));
                }
            }
        });
    }

    init() {
        // Init Date
        document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-IN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        // Setup Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-target');
                this.navigate(targetId);
            });
        });

        // Initial Render
        this.navigate('dashboard');
        
        // Setup Modal Close
        document.getElementById('modal-overlay').addEventListener('click', () => this.closeModal());
    }

    navigate(viewId) {
        // Update nav active state
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-target') === viewId);
        });

        // Update view visibility
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === viewId);
        });

        // Update title
        const titles = {
            dashboard: 'Dashboard',
            billing: 'Billing',
            sales: 'Sales History',
            pending: 'Pending Dues',
            inventory: 'Inventory',
            customers: 'Customers',
            loans: 'Loans & Expenses'
        };
        document.getElementById('page-title').textContent = titles[viewId];

        // Render specific view data
        switch (viewId) {
            case 'dashboard': this.renderDashboard(); break;
            case 'billing': this.initBilling(); break;
            case 'sales': this.renderSales(); break;
            case 'pending': this.renderPending(); break;
            case 'inventory': this.renderInventory(); break;
            case 'customers': this.renderCustomers(); break;
            case 'loans': this.renderLoansAndExpenses(); break;
        }
    }

    // --- UTILS ---
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
    }

    formatDate(dateStr) {
        if(!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-IN');
    }

    // --- MODAL SYSTEM ---
    showModal(title, htmlContent, onSave) {
        const overlay = document.getElementById('modal-overlay');
        const container = document.getElementById('modal-container');
        
        container.innerHTML = `
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="close-btn" onclick="app.closeModal()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="modal-body">
                ${htmlContent}
            </div>
            <div class="modal-footer">
                <button class="action-btn" onclick="app.closeModal()">Cancel</button>
                <button class="action-btn primary" id="modal-save-btn">Save</button>
            </div>
        `;
        
        document.getElementById('modal-save-btn').onclick = () => {
            if (onSave()) {
                this.closeModal();
            }
        };

        overlay.classList.add('active');
        container.classList.add('active');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
        document.getElementById('modal-container').classList.remove('active');
    }

    // --- DASHBOARD ---
    renderDashboard() {
        const today = new Date().toISOString().split('T')[0];
        
        // Calculate Stats
        let todaySales = 0;
        let totalPending = 0;
        let cashCollected = 0;

        this.data.bills.forEach(bill => {
            if (bill.date.startsWith(today)) {
                todaySales += bill.total;
            }
            if (bill.payMethod !== 'Credit') {
                 cashCollected += bill.paidAmount;
            } else if (bill.paidAmount > 0) {
                 cashCollected += bill.paidAmount;
            }
        });

        this.data.customers.forEach(c => {
            totalPending += (c.pendingDues || 0);
        });

        document.getElementById('dash-today-sales').textContent = this.formatCurrency(todaySales);
        document.getElementById('dash-pending-dues').textContent = this.formatCurrency(totalPending);
        document.getElementById('dash-cash-collected').textContent = this.formatCurrency(cashCollected);

        // Low Stock Alerts
        const alertsList = document.getElementById('dash-stock-alerts');
        alertsList.innerHTML = '';
        let alertCount = 0;

        this.data.inventory.forEach(item => {
            if (item.stock <= (item.minStock || 5)) {
                alertCount++;
                alertsList.innerHTML += `
                    <li>
                        <div class="alert-info">
                            <strong>${item.name}</strong>
                            <span>Only ${item.stock} left in stock</span>
                        </div>
                        <button class="action-btn outline" onclick="app.navigate('inventory')">Update</button>
                    </li>
                `;
            }
        });
        document.getElementById('dash-alert-count').textContent = alertCount;
        if (alertCount === 0) {
            alertsList.innerHTML = '<li style="color: var(--text-muted)">No low stock alerts.</li>';
        }

        // EMI Alerts
        const emiList = document.getElementById('dash-emi-alerts');
        emiList.innerHTML = '';
        const upcomingEMIs = this.data.loans.filter(l => l.status === 'Pending').sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0,5);
        
        if (upcomingEMIs.length === 0) {
            emiList.innerHTML = '<li style="color: var(--text-muted)">No upcoming EMIs.</li>';
        } else {
            upcomingEMIs.forEach(emi => {
                emiList.innerHTML += `
                    <li>
                        <div class="alert-info">
                            <strong>${emi.provider}</strong>
                            <span>Due: ${this.formatDate(emi.dueDate)} | Amount: ${this.formatCurrency(emi.amount)}</span>
                        </div>
                    </li>
                `;
            });
        }
    }

    // --- INVENTORY ---
    renderInventory() {
        const tbody = document.querySelector('#inventory-table tbody');
        tbody.innerHTML = '';
        
        this.data.inventory.forEach(item => {
            const margin = item.sellPrice - item.buyPrice;
            const marginPercent = ((margin / item.buyPrice) * 100).toFixed(1);
            
            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.name}</strong></td>
                    <td>
                        <span class="${item.stock <= item.minStock ? 'status-badge status-overdue' : 'status-badge status-paid'}">
                            ${item.stock} units
                        </span>
                    </td>
                    <td>${this.formatCurrency(item.buyPrice)}</td>
                    <td>${this.formatCurrency(item.sellPrice)}</td>
                    <td><span style="color: var(--secondary)">${this.formatCurrency(margin)} (${marginPercent}%)</span></td>
                    <td style="display:flex; gap:5px;">
                        <button class="action-btn icon-only" onclick="app.editInventory('${item.id}')" title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                        <button class="action-btn icon-only" style="color:var(--danger); border-color:rgba(239, 68, 68, 0.3);" onclick="app.deleteInventory('${item.id}')" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                    </td>
                </tr>
            `;
        });
    }

    exportInventoryCSV() {
        const header = ["ID", "Name", "BuyPrice", "SellPrice", "Stock", "MinStock"];
        const rows = this.data.inventory.map(i => [
            i.id,
            `"${i.name.replace(/"/g, '""')}"`,
            i.buyPrice,
            i.sellPrice,
            i.stock,
            i.minStock
        ]);
        
        let csvContent = header.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "inventory.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    importInventoryCSV(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/);
            let updatedCount = 0;
            let addedCount = 0;

            if (lines.length < 2) return;

            // Parse a single CSV line handling quotes
            const parseCsvLine = (line) => {
                let current = '', row = [];
                let inQuotes = false;
                for(let c=0; c<line.length; c++) {
                    const char = line[c];
                    if (char === '"') inQuotes = !inQuotes;
                    else if (char === ',' && !inQuotes) { row.push(current.trim()); current = ''; }
                    else current += char;
                }
                row.push(current.trim());
                return row;
            };

            const headerRow = parseCsvLine(lines[0]).map(h => h.toLowerCase());
            
            // Smart column mapping (works for Asian Paints or standard format)
            let idxId = headerRow.findIndex(h => h === 'id' || h.includes('material'));
            let idxName = headerRow.findIndex(h => h === 'name' || h.includes('description'));
            let idxBuyPrice = headerRow.findIndex(h => h === 'buyprice' || h === 'rate' || h.includes('rate'));
            let idxSellPrice = headerRow.findIndex(h => h === 'sellprice');
            let idxStock = headerRow.findIndex(h => h === 'stock' || h === 'qty' || h === 'quantity');
            let idxMinStock = headerRow.findIndex(h => h === 'minstock');

            // Fallback to strict ordering if we can't find name or buy price in header
            if (idxName === -1 && idxBuyPrice === -1) {
                idxId = 0; idxName = 1; idxBuyPrice = 2; idxSellPrice = 3; idxStock = 4; idxMinStock = 5;
            }

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const row = parseCsvLine(line);
                if (row.length < 3) continue; // Basic validation
                
                const id = idxId >= 0 && row[idxId] ? row[idxId].replace(/"/g, "") : "";
                const name = idxName >= 0 && row[idxName] ? row[idxName].replace(/"/g, "") : "";
                
                // Parse numbers safely from things like "240.00"
                const parseNum = (val) => parseFloat((val || "").replace(/[^0-9.-]+/g,"")) || 0;
                
                const buyPrice = idxBuyPrice >= 0 ? parseNum(row[idxBuyPrice]) : 0;
                let sellPrice = idxSellPrice >= 0 ? parseNum(row[idxSellPrice]) : 0;
                const stock = idxStock >= 0 ? parseInt(parseNum(row[idxStock])) : 0;
                const minStock = idxMinStock >= 0 ? parseInt(parseNum(row[idxMinStock])) : 5;

                if (!name) continue;

                // Auto-calculate sell price if missing (+10%)
                if (sellPrice === 0 && buyPrice > 0) {
                    sellPrice = parseFloat((buyPrice * 1.10).toFixed(2));
                }

                let existing = null;
                if (id) {
                    existing = this.data.inventory.find(item => item.id === id);
                }
                if (!existing) {
                    existing = this.data.inventory.find(item => item.name.toLowerCase() === name.toLowerCase());
                }

                if (existing) {
                    existing.buyPrice = buyPrice || existing.buyPrice;
                    existing.sellPrice = sellPrice || existing.sellPrice;
                    existing.stock += stock; // ADD new stock to existing stock
                    if (idxMinStock >= 0) existing.minStock = minStock;
                    updatedCount++;
                } else {
                    this.data.inventory.push({
                        id: StorageManager.generateId(),
                        name, buyPrice, sellPrice, stock, minStock
                    });
                    addedCount++;
                }
            }

            StorageManager.saveData(this.data);
            this.renderInventory();
            alert(`Stock Upload Successful!\n\nAdded: ${addedCount} new items\nUpdated: ${updatedCount} existing items\n\nStock quantities have been added and Selling Prices auto-calculated (+10%)!`);
            event.target.value = ''; // Reset input
        };
        reader.readAsText(file);
    }

    showInventoryModal(itemId = null) {
        let item = { name: '', buyPrice: '', sellPrice: '', stock: '', minStock: 5 };
        let title = 'Add New Item';
        
        if (itemId) {
            item = this.data.inventory.find(i => i.id === itemId);
            title = 'Edit Item';
        }

        const html = `
            <div class="form-group">
                <label>Item Name</label>
                <input type="text" id="inv-name" value="${item.name}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Buy Price (₹)</label>
                    <input type="number" id="inv-buy" value="${item.buyPrice}" oninput="document.getElementById('inv-sell').value = this.value ? (parseFloat(this.value) * 1.10).toFixed(2) : ''">
                </div>
                <div class="form-group">
                    <label>Sell Price (₹)</label>
                    <input type="number" id="inv-sell" value="${item.sellPrice}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Current Stock</label>
                    <input type="number" id="inv-stock" value="${item.stock}">
                </div>
                <div class="form-group">
                    <label>Low Stock Alert At</label>
                    <input type="number" id="inv-min" value="${item.minStock}">
                </div>
            </div>
        `;

        this.showModal(title, html, () => {
            const name = document.getElementById('inv-name').value;
            const buy = parseFloat(document.getElementById('inv-buy').value);
            const sell = parseFloat(document.getElementById('inv-sell').value);
            const stock = parseInt(document.getElementById('inv-stock').value);
            const minStock = parseInt(document.getElementById('inv-min').value);

            if(!name || isNaN(buy) || isNaN(sell) || isNaN(stock)) {
                alert("Please fill all fields correctly.");
                return false;
            }

            if (itemId) {
                const idx = this.data.inventory.findIndex(i => i.id === itemId);
                this.data.inventory[idx] = { ...this.data.inventory[idx], name, buyPrice: buy, sellPrice: sell, stock, minStock };
            } else {
                this.data.inventory.push({ id: StorageManager.generateId(), name, buyPrice: buy, sellPrice: sell, stock, minStock });
            }

            StorageManager.saveData(this.data);
            this.renderInventory();
            return true;
        });
    }

    editInventory(id) {
        this.showInventoryModal(id);
    }
    
    deleteInventory(id) {
        if(confirm("Are you sure you want to delete this item? This cannot be undone.")) {
            this.data.inventory = this.data.inventory.filter(i => i.id !== id);
            StorageManager.saveData(this.data);
            this.renderInventory();
            
            // Re-init billing if we deleted from inventory to refresh the dropdown
            if(document.getElementById('billing').classList.contains('active')) {
                this.initBilling();
            }
        }
    }

    // --- CUSTOMERS ---
    renderCustomers() {
        const tbody = document.querySelector('#customers-table tbody');
        tbody.innerHTML = '';
        
        this.data.customers.forEach(c => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${c.name}</strong></td>
                    <td>${c.phone || 'N/A'}</td>
                    <td>${this.formatCurrency(c.totalPurchased)}</td>
                    <td>
                        <span style="color: ${c.pendingDues > 0 ? 'var(--danger)' : 'inherit'}">
                            ${this.formatCurrency(c.pendingDues)}
                        </span>
                    </td>
                    <td>${this.formatDate(c.lastPurchase)}</td>
                    <td style="display:flex; gap:5px;">
                        <button class="action-btn icon-only" onclick="app.editCustomer('${c.id}')" title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                        <button class="action-btn icon-only" style="color:var(--danger); border-color:rgba(239, 68, 68, 0.3);" onclick="app.deleteCustomer('${c.id}')" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                    </td>
                </tr>
            `;
        });
    }

    showCustomerModal(customerId = null) {
        let cust = { name: '', phone: '' };
        let title = 'Add New Customer';
        
        if (customerId) {
            cust = this.data.customers.find(c => c.id === customerId);
            title = 'Edit Customer';
        }

        const html = `
            <div class="form-group">
                <label>Customer Name</label>
                <input type="text" id="cust-name" value="${cust.name}">
            </div>
            <div class="form-group">
                <label>Phone Number (WhatsApp)</label>
                <input type="text" id="cust-phone" value="${cust.phone || ''}">
            </div>
        `;

        this.showModal(title, html, () => {
            const name = document.getElementById('cust-name').value;
            const phone = document.getElementById('cust-phone').value;

            if(!name) { alert("Name is required."); return false; }

            if (customerId) {
                const idx = this.data.customers.findIndex(c => c.id === customerId);
                this.data.customers[idx].name = name;
                this.data.customers[idx].phone = phone;
            } else {
                this.data.customers.push({
                    id: StorageManager.generateId(),
                    name, phone, totalPurchased: 0, pendingDues: 0, lastPurchase: null
                });
            }

            StorageManager.saveData(this.data);
            this.renderCustomers();
            
            // Re-init billing if we added from billing view
            if(document.getElementById('billing').classList.contains('active')) {
                this.initBilling();
            }
            return true;
        });
    }
    
    editCustomer(id) {
        this.showCustomerModal(id);
    }

    deleteCustomer(id) {
        if(confirm("Are you sure you want to delete this customer? This cannot be undone.")) {
            // Also need to decide what to do with their bills, but for now we just remove the customer record.
            this.data.customers = this.data.customers.filter(c => c.id !== id);
            StorageManager.saveData(this.data);
            this.renderCustomers();
            
            // Re-init billing to refresh customer dropdown
            if(document.getElementById('billing').classList.contains('active')) {
                this.initBilling();
            }
        }
    }



    // --- BILLING ---
    numberToWords(num) {
        if (num === 0) return 'Zero';
        const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
        const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
        if ((num = num.toString()).length > 9) return 'overflow';
        let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return ''; 
        let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only ' : 'Only';
        return str;
    }

    initBilling() {
        this.currentCart = [];
        
        // Restore standard billing UI
        document.querySelector('.billing-form').style.display = 'block';
        const btnComplete = document.getElementById('btn-complete-bill');
        if (btnComplete) btnComplete.style.display = 'block';
        
        // Generate a new Bill ID (sequential starting from 01)
        const nextNum = this.data.bills.length + 1;
        const newBillId = nextNum.toString().padStart(2, '0');
        document.getElementById('inv-no-val').textContent = newBillId;
        this.pendingBillId = newBillId;
        
        // Set Date
        document.getElementById('inv-date-val').textContent = new Date().toLocaleDateString('en-GB');

        // Customer selection
        const custSelect = document.getElementById('bill-customer');
        custSelect.innerHTML = '<option value="">Select or Create New...</option>';
        this.data.customers.forEach(c => {
            custSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.phone || 'No phone'})</option>`;
        });
        
        custSelect.addEventListener('change', (e) => {
            const cust = this.data.customers.find(c => c.id === e.target.value);
            if (cust) {
                document.getElementById('inv-cust-name').textContent = cust.name;
                document.getElementById('inv-cust-place').textContent = "VISAKHAPATNAM"; // default
                document.getElementById('inv-cust-gst').textContent = "UNREGISTERED";
            } else {
                document.getElementById('inv-cust-name').textContent = "";
                document.getElementById('inv-cust-place').textContent = "";
                document.getElementById('inv-cust-gst').textContent = "";
            }
        });



        // Inventory
        const itemSelect = document.getElementById('bill-item-select');
        itemSelect.innerHTML = '<option value="">Search Inventory...</option>';
        this.data.inventory.filter(i => i.stock > 0).forEach(i => {
            itemSelect.innerHTML += `<option value="${i.id}">${i.name} (₹${i.sellPrice}) - Stock: ${i.stock}</option>`;
        });
        
        this.renderBillTable();
        
        // Auto-update amount paid based on payment method
        document.querySelectorAll('input[name="pay-method"]').forEach(radio => {
            radio.onchange = (e) => {
                const method = e.target.value;
                const amtInput = document.getElementById('bill-amount-paid');
                if (method === 'Credit') {
                    amtInput.value = 0;
                } else {
                    const rs = parseFloat(document.getElementById('inv-tot-rs').textContent) || 0;
                    const psText = document.getElementById('inv-tot-ps').textContent;
                    const ps = parseFloat(psText === '00' ? 0 : (psText.length === 1 ? '0'+psText : psText))/100 || 0;
                    amtInput.value = (rs + ps).toFixed(2);
                }
            };
        });
    }

    addBillItem() {
        const itemId = document.getElementById('bill-item-select').value;
        const qty = parseInt(document.getElementById('bill-item-qty').value);

        if (!itemId || isNaN(qty) || qty <= 0) return;

        const item = this.data.inventory.find(i => i.id === itemId);
        
        if (qty > item.stock) {
            alert(`Only ${item.stock} units available in stock!`);
            return;
        }

        const existing = this.currentCart.find(i => i.id === itemId);
        if (existing) {
            if (existing.qty + qty > item.stock) {
                alert(`Cannot exceed stock limit (${item.stock})`);
                return;
            }
            existing.qty += qty;
            existing.total = existing.qty * existing.price;
        } else {
            this.currentCart.push({
                id: item.id,
                name: item.name,
                price: item.sellPrice,
                qty: qty,
                total: qty * item.sellPrice
            });
        }

        this.renderBillTable();
    }

    removeBillItem(id) {
        this.currentCart = this.currentCart.filter(i => i.id !== id);
        this.renderBillTable();
    }

    renderBillTable(isHistorical = false) {
        const tbody = document.getElementById('inv-items-body');
        tbody.innerHTML = '';
        
        let subtotal = 0;
        let sno = 1;

        this.currentCart.forEach(item => {
            subtotal += item.total;
            const rs = Math.floor(item.total);
            const ps = Math.round((item.total - rs) * 100).toString().padStart(2, '0');
            
            const deleteBtn = isHistorical ? '' : `
                <button class="action-btn icon-only no-print" style="padding:2px; float:right; background:transparent; border:none; color:var(--danger);" onclick="app.removeBillItem('${item.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            
            tbody.innerHTML += `
                <tr>
                    <td class="col-sno">${sno++}</td>
                    <td>
                        ${item.name} 
                        ${deleteBtn}
                    </td>
                    <td class="col-qty">${item.qty}</td>
                    <td class="col-rate">${item.price.toFixed(2)}</td>
                    <td class="col-rs">${rs}</td>
                    <td class="col-ps">${ps}</td>
                </tr>
            `;
        });
        
        // Add empty rows to keep the table structure intact visually if less than 5 items
        for(let i = sno; i <= 5; i++) {
            tbody.innerHTML += `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`;
        }

        if (!isHistorical) {
            this.calculateBillTotals(subtotal);
        }
    }

    calculateBillTotals(sub = null) {
        let subtotal = sub;
        if (subtotal === null) {
            subtotal = this.currentCart.reduce((sum, item) => sum + item.total, 0);
        }
        
        const gstRate = parseFloat(document.getElementById('bill-gst-rate').value) || 0;
        const gstAmount = subtotal * (gstRate / 100);
        const grandTotal = subtotal + gstAmount;

        const rs = Math.floor(grandTotal);
        const ps = Math.round((grandTotal - rs) * 100).toString().padStart(2, '0');

        document.getElementById('inv-tot-rs').textContent = rs;
        document.getElementById('inv-tot-ps').textContent = ps;
        
        // Update words
        document.getElementById('inv-words-val').textContent = this.numberToWords(rs);

        // Auto-fill payment amount if not credit
        const method = document.querySelector('input[name="pay-method"]:checked').value;
        if (method !== 'Credit') {
            document.getElementById('bill-amount-paid').value = grandTotal.toFixed(2);
        }
    }

    generateBill() {
        const customerId = document.getElementById('bill-customer').value;
        
        if (!customerId) { alert("Please select a customer."); return; }
        if (this.currentCart.length === 0) { alert("Bill is empty!"); return; }

        const gstRate = parseFloat(document.getElementById('bill-gst-rate').value) || 0;
        const subtotal = this.currentCart.reduce((sum, item) => sum + item.total, 0);
        const gstAmount = subtotal * (gstRate / 100);
        const total = subtotal + gstAmount;

        const payMethod = document.querySelector('input[name="pay-method"]:checked').value;
        let paidAmount = parseFloat(document.getElementById('bill-amount-paid').value) || 0;

        // Validation
        if (paidAmount > total) paidAmount = total;

        const bill = {
            id: this.pendingBillId,
            date: new Date().toISOString(),
            customerId,
            items: [...this.currentCart],
            subtotal,
            gst: gstRate,
            total,
            paidAmount,
            payMethod
        };

        // Update Inventory Stock
        this.currentCart.forEach(cartItem => {
            const invItem = this.data.inventory.find(i => i.id === cartItem.id);
            if (invItem) invItem.stock -= cartItem.qty;
        });

        // Update Customer
        const cust = this.data.customers.find(c => c.id === customerId);
        if (cust) {
            cust.totalPurchased += total;
            cust.lastPurchase = bill.date;
            const pendingForThisBill = total - paidAmount;
            if (pendingForThisBill > 0) {
                cust.pendingDues += pendingForThisBill;
            }
        }



        this.data.bills.push(bill);
        StorageManager.saveData(this.data);

        alert(`Bill ${bill.id} generated successfully! You can print it now.`);
        
        // Reset form
        this.initBilling();
        document.getElementById('bill-gst-rate').value = "0";
        document.getElementById('bill-amount-paid').value = "";
    }

    printBill() {
        window.print();
    }
    
    deleteBill(billId) {
        if (!confirm(`Are you sure you want to delete Bill #${billId}?\n\nThis will RESTORE the inventory stock and REMOVE the amount from the customer's pending dues.`)) return;

        const billIndex = this.data.bills.findIndex(b => b.id === billId);
        if (billIndex === -1) return;
        const bill = this.data.bills[billIndex];

        // Restore Inventory Stock
        bill.items.forEach(cartItem => {
            const invItem = this.data.inventory.find(i => i.id === cartItem.id);
            if (invItem) invItem.stock += cartItem.qty;
        });

        // Restore Customer Balances
        const cust = this.data.customers.find(c => c.id === bill.customerId);
        if (cust) {
            cust.totalPurchased -= bill.total;
            if (cust.totalPurchased < 0) cust.totalPurchased = 0;
            
            const pendingForThisBill = bill.total - bill.paidAmount;
            if (pendingForThisBill > 0) {
                cust.pendingDues -= pendingForThisBill;
                if (cust.pendingDues < 0) cust.pendingDues = 0;
            }
        }

        // Remove the bill
        this.data.bills.splice(billIndex, 1);
        StorageManager.saveData(this.data);
        
        // Re-render everything
        this.renderSales();
        this.renderPending();
    }
    
    viewHistoricalBill(billId) {
        const bill = this.data.bills.find(b => b.id === billId);
        if(!bill) return;
        
        // This resets billing to default mode...
        this.navigate('billing');
        
        // ...now immediately override it with historical mode
        document.querySelector('.billing-form').style.display = 'none';
        const btnComplete = document.getElementById('btn-complete-bill');
        if (btnComplete) btnComplete.style.display = 'none';
        
        document.getElementById('inv-no-val').textContent = bill.id;
        document.getElementById('inv-date-val').textContent = new Date(bill.date).toLocaleDateString('en-GB');
        
        const cust = this.data.customers.find(c => c.id === bill.customerId);
        if (cust) {
            document.getElementById('inv-cust-name').textContent = cust.name;
            document.getElementById('inv-cust-place').textContent = "VISAKHAPATNAM"; // default or stored value
            document.getElementById('inv-cust-gst').textContent = "UNREGISTERED";
        }
        
        this.currentCart = bill.items;
        
        // Render without recalculating or adding delete buttons
        this.renderBillTable(true);
        
        // Manually override totals to match exactly what was saved historically
        const rs = Math.floor(bill.total);
        const ps = Math.round((bill.total - rs) * 100).toString().padStart(2, '0');
        document.getElementById('inv-tot-rs').textContent = rs;
        document.getElementById('inv-tot-ps').textContent = ps;
        document.getElementById('inv-words-val').textContent = this.numberToWords(rs);
    }

    // --- SALES HISTORY ---
    renderSales() {
        const tbody = document.querySelector('#sales-table tbody');
        const monthFilter = document.getElementById('sales-month-filter').value;
        const searchQ = document.getElementById('sales-search').value.toLowerCase();
        
        tbody.innerHTML = '';
        
        let filteredBills = [...this.data.bills].reverse();

        if (monthFilter) {
            filteredBills = filteredBills.filter(b => b.date.startsWith(monthFilter));
        }

        filteredBills.forEach(bill => {
            const cust = this.data.customers.find(c => c.id === bill.customerId);
            const custName = cust ? cust.name : 'Unknown';
            
            if (searchQ && !custName.toLowerCase().includes(searchQ)) return;

            const isFullyPaid = bill.paidAmount >= bill.total;
            let statusHtml = '';
            
            if (isFullyPaid) {
                statusHtml = `<span class="status-badge status-paid">Paid (${bill.payMethod})</span>`;
            } else {
                statusHtml = `<span class="status-badge status-pending">Pending: ${this.formatCurrency(bill.total - bill.paidAmount)}</span>`;
            }

            tbody.innerHTML += `
                <tr>
                    <td>${this.formatDate(bill.date)}</td>
                    <td><strong>${bill.id}</strong></td>
                    <td>${custName}</td>
                    <td>${this.formatCurrency(bill.total)}</td>
                    <td>${statusHtml}</td>
                    <td>
                        <button class="action-btn icon-only" title="View Bill" onclick="app.viewHistoricalBill('${bill.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
                        <button class="action-btn icon-only no-print" title="Delete Bill" onclick="app.deleteBill('${bill.id}')" style="color: var(--danger);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    </td>
                </tr>
            `;
        });
    }

    // --- PENDING DUES ---
    renderPending() {
        const tbody = document.querySelector('#pending-table tbody');
        tbody.innerHTML = '';
        
        // Get all bills with pending amounts
        const pendingBills = this.data.bills.filter(b => b.paidAmount < b.total);

        pendingBills.forEach(bill => {
            const cust = this.data.customers.find(c => c.id === bill.customerId);
            const dueAmount = bill.total - bill.paidAmount;
            
            const billDate = new Date(bill.date);
            const today = new Date();
            const diffTime = Math.abs(today - billDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            let msg = encodeURIComponent(`Hello ${cust.name}, this is a gentle reminder regarding your pending payment of ₹${dueAmount.toFixed(2)} for Bill No ${bill.id}. Kindly process the payment at your earliest convenience. Thank you, RR ENTERPRISE.`);
            let waLink = cust.phone ? `https://wa.me/91${cust.phone}?text=${msg}` : '#';

            tbody.innerHTML += `
                <tr>
                    <td><strong>${cust ? cust.name : 'Unknown'}</strong><br><small>${cust ? cust.phone : ''}</small></td>
                    <td>${bill.id}</td>
                    <td>${this.formatDate(bill.date)}</td>
                    <td><strong style="color: var(--danger)">${this.formatCurrency(dueAmount)}</strong></td>
                    <td>${diffDays} days</td>
                    <td>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="action-btn outline" onclick="app.collectPayment('${bill.id}')">Collect</button>
                            <a href="${waLink}" target="_blank" class="action-btn success icon-only" title="Send WhatsApp Reminder" style="text-decoration:none; color:white;">
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="css-i6dzq1"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            </a>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    collectPayment(billId) {
        const bill = this.data.bills.find(b => b.id === billId);
        if(!bill) return;
        const dueAmount = bill.total - bill.paidAmount;

        const html = `
            <div class="form-group">
                <label>Bill ID</label>
                <input type="text" value="${bill.id}" disabled>
            </div>
            <div class="form-group">
                <label>Pending Amount</label>
                <input type="text" value="${dueAmount.toFixed(2)}" disabled>
            </div>
            <div class="form-group">
                <label>Collect Amount (₹)</label>
                <input type="number" id="collect-amt" value="${dueAmount.toFixed(2)}" max="${dueAmount.toFixed(2)}">
            </div>
        `;

        this.showModal('Collect Payment', html, () => {
            const amt = parseFloat(document.getElementById('collect-amt').value);
            if(isNaN(amt) || amt <= 0 || amt > dueAmount) {
                alert("Invalid amount"); return false;
            }

            // Update Bill
            bill.paidAmount += amt;

            // Update Customer total dues
            const cust = this.data.customers.find(c => c.id === bill.customerId);
            if(cust) {
                cust.pendingDues -= amt;
                if(cust.pendingDues < 0) cust.pendingDues = 0;
            }

            StorageManager.saveData(this.data);
            this.renderPending();
            return true;
        });
    }

    // --- LOANS & EXPENSES ---
    renderLoansAndExpenses() {
        // Expenses
        const eTbody = document.querySelector('#expenses-table tbody');
        eTbody.innerHTML = '';
        this.data.expenses.forEach(e => {
            eTbody.innerHTML += `
                <tr>
                    <td>${this.formatDate(e.date)}</td>
                    <td>${e.desc}</td>
                    <td><strong style="color: var(--danger)">-${this.formatCurrency(e.amount)}</strong></td>
                </tr>
            `;
        });

        // Loans
        const lTbody = document.querySelector('#loans-table tbody');
        lTbody.innerHTML = '';
        this.data.loans.forEach(l => {
            lTbody.innerHTML += `
                <tr>
                    <td><strong>${l.provider}</strong></td>
                    <td>${this.formatCurrency(l.amount)}</td>
                    <td>${this.formatDate(l.dueDate)}</td>
                    <td><span class="status-badge ${l.status === 'Paid' ? 'status-paid' : 'status-pending'}">${l.status}</span></td>
                </tr>
            `;
        });
    }

    showExpenseModal() {
        const html = `
            <div class="form-group">
                <label>Description</label>
                <input type="text" id="exp-desc">
            </div>
            <div class="form-group">
                <label>Amount (₹)</label>
                <input type="number" id="exp-amt">
            </div>
        `;

        this.showModal('Add Expense', html, () => {
            const desc = document.getElementById('exp-desc').value;
            const amt = parseFloat(document.getElementById('exp-amt').value);

            if(!desc || isNaN(amt)) return false;

            this.data.expenses.push({
                id: StorageManager.generateId(),
                date: new Date().toISOString(),
                desc, amount: amt
            });

            StorageManager.saveData(this.data);
            this.renderLoansAndExpenses();
            return true;
        });
    }

    showLoanModal() {
        const html = `
            <div class="form-group">
                <label>Provider/Bank Name</label>
                <input type="text" id="loan-provider">
            </div>
            <div class="form-group">
                <label>EMI Amount (₹)</label>
                <input type="number" id="loan-amt">
            </div>
            <div class="form-group">
                <label>Next Due Date</label>
                <input type="date" id="loan-date">
            </div>
        `;

        this.showModal('Add Loan/EMI', html, () => {
            const provider = document.getElementById('loan-provider').value;
            const amt = parseFloat(document.getElementById('loan-amt').value);
            const date = document.getElementById('loan-date').value;

            if(!provider || isNaN(amt) || !date) return false;

            this.data.loans.push({
                id: StorageManager.generateId(),
                provider, amount: amt, dueDate: date, status: 'Pending'
            });

            StorageManager.saveData(this.data);
            this.renderLoansAndExpenses();
            return true;
        });
    }

    exportData() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href",     dataStr     );
        dlAnchorElem.setAttribute("download", "rr_enterprise_backup.json");
        dlAnchorElem.click();
    }
}

// Initialize Application
const app = new App();
