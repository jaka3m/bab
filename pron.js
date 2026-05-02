
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare Worker Manager</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #1a1a1a; color: white; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; flex-wrap: wrap; }
    .logo { font-size: 24px; font-weight: bold; }
    .card { background: #2d2d2d; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
    .btn { background: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; margin: 5px; }
    .btn:hover { background: #0056b3; }
    .btn-danger { background: #dc3545; }
    .btn-danger:hover { background: #c82333; }
    .btn-success { background: #28a745; }
    .btn-success:hover { background: #218838; }
    .btn-warning { background: #ffc107; color: black; }
    .btn-warning:hover { background: #e0a800; }
    .btn-info { background: #17a2b8; }
    .btn-info:hover { background: #138496; }
    .form-group { margin-bottom: 15px; }
    .form-label { display: block; margin-bottom: 5px; }
    .form-input { width: 100%; padding: 8px; border: 1px solid #444; border-radius: 5px; background: #1a1a1a; color: white; }
    .form-textarea { min-height: 300px; font-family: monospace; font-size: 12px; }
    .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; z-index: 1000; }
    .modal-content { background: #2d2d2d; padding: 20px; border-radius: 10px; width: 90%; max-width: 800px; max-height: 90vh; overflow-y: auto; }
    .modal-large { max-width: 95%; }
    .worker-item { background: #3d3d3d; padding: 15px; margin: 10px 0; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
    .worker-item.selected { background: #4a4a4a; border: 1px solid #007bff; }
    .worker-checkbox { margin-right: 10px; }
    .notification { position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 15px; border-radius: 5px; display: none; z-index: 1001; }
    .notification.error { background: #dc3545; }
    .notification.warning { background: #ffc107; color: black; }
    .accounts-panel { background: #3d3d3d; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .account-badge { display: inline-block; background: #007bff; color: white; padding: 5px 10px; border-radius: 15px; margin: 5px; font-size: 12px; }
    .account-badge.active { background: #28a745; }
    .account-badge .remove { margin-left: 5px; cursor: pointer; }
    .bulk-actions { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #333; padding: 15px; border-radius: 10px; display: none; z-index: 999; }
    .bulk-actions.active { display: block; }
    .search-filter { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
    .search-filter input, .search-filter select { flex: 1; min-width: 200px; }
    .auto-refresh { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
    .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0; }
    .analytics-card { background: #3d3d3d; padding: 15px; border-radius: 8px; text-align: center; }
    .analytics-value { font-size: 24px; font-weight: bold; margin: 10px 0; }
    .analytics-label { font-size: 12px; opacity: 0.8; }
    
    /* Worker Actions dengan Dropdown */
    .worker-actions {
      display: flex;
      gap: 5px;
      position: relative;
    }
    
    .actions-dropdown {
      position: relative;
      display: inline-block;
    }
    
    .dropdown-content {
      display: none;
      position: absolute;
      right: 0;
      background: #2d2d2d;
      min-width: 160px;
      box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
      z-index: 100;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid #444;
    }
    
    .dropdown-content a {
      color: white;
      padding: 12px 16px;
      text-decoration: none;
      display: block;
      cursor: pointer;
      border-bottom: 1px solid #444;
    }
    
    .dropdown-content a:hover {
      background: #3d3d3d;
    }
    
    .dropdown-content a.delete-action {
      color: #ff6b6b;
    }
    
    .dropdown-content a.delete-action:hover {
      background: #5a2a2a;
    }
    
    .actions-dropdown:hover .dropdown-content {
      display: block;
    }
    
    /* Perbaikan tampilan text agar tidak keluar */
    .worker-name {
      font-weight: bold;
      word-break: break-word;
    }
    
    .account-email {
      font-size: 12px;
      color: #ccc;
      word-break: break-word;
    }
    
    .worker-info {
      flex: 1;
      min-width: 0;
      margin-right: 15px;
    }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 10px 0; }
    .stat-item { text-align: center; padding: 10px; background: #3d3d3d; border-radius: 5px; }
    .user-info-item { display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #444; }
    .user-info-label { font-weight: bold; }
    .user-info-value { color: #ccc; word-break: break-word; }
    .api-key-masked { font-family: monospace; background: #1a1a1a; padding: 5px 10px; border-radius: 3px; border: 1px solid #444; }
    .copy-btn { background: #6c757d; padding: 2px 8px; font-size: 12px; margin-left: 5px; }
    .copy-btn:hover { background: #545b62; }
    
    /* Accounts dropdown */
    .accounts-dropdown {
      position: relative;
      display: inline-block;
    }
    
    .accounts-dropdown-content {
      display: none;
      position: absolute;
      background: #2d2d2d;
      min-width: 250px;
      box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
      z-index: 100;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid #444;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .accounts-dropdown-content .account-item {
      padding: 10px 15px;
      border-bottom: 1px solid #444;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .accounts-dropdown-content .account-item:hover {
      background: #3d3d3d;
    }
    
    .accounts-dropdown-content .account-item.active {
      background: #007bff;
    }
    
    .accounts-dropdown:hover .accounts-dropdown-content {
      display: block;
    }
    
    .current-account {
      background: #28a745;
      color: white;
      padding: 8px 15px;
      border-radius: 20px;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    
    .loading {
      opacity: 0.6;
      pointer-events: none;
    }

    /* Config Display Styles */
    .config-display {
      background: #1a1a1a;
      padding: 10px;
      border-radius: 5px;
      margin: 10px 0;
      border: 1px solid #444;
      font-family: monospace;
      font-size: 12px;
      word-break: break-all;
    }
    
    .config-type {
      font-weight: bold;
      margin-bottom: 5px;
      color: #007bff;
    }
    
    .simple-notification {
      background: #28a745;
      color: white;
      padding: 10px;
      border-radius: 5px;
      text-align: center;
      margin: 10px 0;
    }
    
    .proxy-info {
      background: #1a3a5f;
      color: white;
      padding: 10px;
      border-radius: 5px;
      margin: 10px 0;
      border-left: 4px solid #007bff;
    }
    
    .proxy-ip {
      font-family: monospace;
      font-weight: bold;
      background: #2d2d2d;
      padding: 5px 10px;
      border-radius: 3px;
      margin: 5px 0;
      display: inline-block;
    }

    /* Wildcard Domain Styles */
    .wildcard-domain-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      margin: 5px 0;
      background: #3d3d3d;
      border-radius: 5px;
      word-break: break-all;
    }

    .wildcard-domain-actions {
      display: flex;
      gap: 5px;
      flex-shrink: 0;
    }

    .auto-discover-status {
      background: #2d2d2d;
      padding: 10px;
      border-radius: 5px;
      margin: 10px 0;
      border-left: 4px solid #007bff;
    }

    .tabs {
      display: flex;
      border-bottom: 1px solid #444;
      margin-bottom: 15px;
    }

    .tab {
      padding: 10px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }

    .tab.active {
      border-bottom: 2px solid #007bff;
      color: #007bff;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .progress-bar {
      background: #1a1a1a;
      border-radius: 5px;
      margin: 10px 0;
      height: 20px;
      overflow: hidden;
    }

    .progress {
      background: #007bff;
      height: 100%;
      width: 0%;
      transition: width 0.3s ease;
    }

    /* User Detail Styles */
    .user-detail-section {
      margin-bottom: 20px;
      padding: 15px;
      background: #3d3d3d;
      border-radius: 8px;
    }

    .user-detail-section h4 {
      margin-bottom: 15px;
      color: #007bff;
      border-bottom: 1px solid #444;
      padding-bottom: 8px;
    }

    .account-detail-card {
      background: #2d2d2d;
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0;
      border-left: 4px solid #007bff;
    }

    .beta-tag {
      background: #28a745;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      margin-left: 5px;
    }

    .plan-badge {
      background: #ffc107;
      color: black;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
    }

    /* Close button improvements */
    .modal-close-btn {
      position: absolute;
      top: 15px;
      right: 15px;
      background: #dc3545;
      color: white;
      border: none;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: bold;
    }

    .modal-close-btn:hover {
      background: #c82333;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #444;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">Cloudflare Worker Manager</div>
      <div>
        <button class="btn" id="loginBtn">Add Account</button>
        <button class="btn" id="createWorkerBtn" style="display:none;">Create Worker</button>
        <button class="btn" id="bulkCreateBtn" style="display:none;">Bulk Create</button>
        <button class="btn btn-warning" id="wildcardBtn" style="display:none;">Wildcard Domain</button>
        <div class="actions-dropdown" id="bulkActionsDropdown" style="display:none;">
          <button class="btn btn-warning">Bulk Actions ▼</button>
          <div class="dropdown-content">
            <a onclick="showBulkActionsModal()">Manage Selected Workers</a>
          </div>
        </div>
        <button class="btn btn-info" id="exportConfigBtn" style="display:none;">Export Config</button>
      </div>
    </header>

    <div id="accountsPanel" class="accounts-panel" style="display:none;">
      <h3>Active Accounts:</h3>
      <div class="accounts-dropdown">
        <div class="current-account" id="currentAccountDisplay">
          <span id="currentAccountEmail">No account selected</span>
          <span>▼</span>
        </div>
        <div class="accounts-dropdown-content" id="accountsDropdownList"></div>
      </div>
      <div id="otherAccounts" style="margin-top: 10px; display: none;">
        <small>Other accounts: <span id="otherAccountsCount">0</span> more</small>
      </div>
    </div>

    <div id="accountStatus" class="card">
      <h3>Status: <span id="statusText">Not Logged In</span></h3>
      <div id="loginForm">
        <div class="form-group">
          <label class="form-label">Email:</label>
          <input type="email" class="form-input" id="email" placeholder="your-email@example.com">
        </div>
        <div class="form-group">
          <label class="form-label">API Key:</label>
          <input type="password" class="form-input" id="apiKey" placeholder="Global API Key">
        </div>
        <button class="btn" id="submitLogin">Login</button>
      </div>
      <div id="accountInfo" style="display:none;">
        <p>Current Account: <span id="userEmail"></span></p>
        <div class="form-group">
          <label class="form-label">Select Cloudflare Account:</label>
          <select class="form-input" id="accountSelect"></select>
        </div>
        <button class="btn btn-info" id="userDetailBtn">View User Details</button>
        <button class="btn btn-danger" id="logoutBtn">Logout Current</button>
        <button class="btn btn-danger" id="logoutAllBtn">Logout All</button>
      </div>
    </div>

    <div id="workersSection" class="card" style="display:none;">
      <h3>Your Workers (All Accounts) 
        <span id="selectedCount" style="font-size: 14px; background: #007bff; padding: 2px 8px; border-radius: 10px; display: none;">
          Selected: <span id="selectedCountNumber">0</span>
        </span>
      </h3>
      
      <div class="search-filter">
        <input type="text" class="form-input" id="searchWorkers" placeholder="Search workers by name...">
        <select class="form-input" id="filterAccount">
          <option value="">All Accounts</option>
        </select>
        <button class="btn" id="clearSearch">Clear</button>
      </div>

      <div class="auto-refresh">
        <label>
          <input type="checkbox" id="autoRefreshToggle"> Auto Refresh
        </label>
        <select class="form-input" id="autoRefreshInterval" style="width: 150px;">
          <option value="30">30 seconds</option>
          <option value="60">1 minute</option>
          <option value="300">5 minutes</option>
        </select>
        <span id="autoRefreshStatus">Off</span>
      </div>

      <div>
        <button class="btn" id="refreshWorkers">Refresh</button>
        <button class="btn btn-warning" id="selectAllBtn">Select All</button>
        <button class="btn btn-warning" id="deselectAllBtn">Deselect All</button>
        <button class="btn btn-info" id="analyticsBtn">View Analytics</button>
      </div>
      <div id="workersList"></div>
    </div>

    <!-- Create Worker Modal -->
    <div id="createWorkerModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Create New Worker</h3>
          <button class="modal-close-btn" id="cancelCreateWorker">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Select Account:</label>
          <select class="form-input" id="createAccountSelect"></select>
        </div>
        <div class="form-group">
          <label class="form-label">Worker Name:</label>
          <input type="text" class="form-input" id="workerName" placeholder="my-worker">
        </div>
        <div class="form-group">
          <label class="form-label">Select Template:</label>
          <select class="form-input" id="workerTemplate">
            <option value="custom">Custom URL</option>
            <option value="proxy-checker">PROXY CHECKER</option>
            <option value="nautica-mod">NAUTICA MOD</option>
            <option value="nautica">NAUTICA</option>
            <option value="Gateway">Gateway</option>
            <option value="GatewayMod">Gateway Mod</option>
            <option value="vmess">Vmess</option>
            <option value="vmessMod">Vmess Mod</option>
           <option value="Green-jossvpn">Green-jossvpn</option>
          </select>
        </div>
        <div class="form-group" id="customUrlGroup">
          <label class="form-label">Script URL (optional):</label>
          <input type="text" class="form-input" id="scriptUrl" value="https://r2.lifetime69.workers.dev/raw/mlwrtdd95ymkfc8tdd">
          <small style="color: #ccc;">Nama file GitHub bisa bebas, tidak harus worker.js</small>
        </div>
        
        <!-- Proxy IP Info untuk NAUTICA -->
        <div id="proxyInfo" class="proxy-info" style="display: none;">
          <h4>🔒 NAUTICA Proxy Information</h4>
          <p>Template NAUTICA akan menggunakan proxy IP acak dari:</p>
          <p><code>https://r2.lifetime69.workers.dev/raw/bj3yy7362a9mkfcjltj</code></p>
          <p>Proxy IP yang akan digunakan: <span id="currentProxyIP" class="proxy-ip">Loading...</span></p>
          <button type="button" class="btn btn-warning btn-small" id="refreshProxyBtn">Refresh Proxy IP</button>
        </div>
        
        <div id="createResult" style="display:none;"></div>
        <button class="btn btn-success" id="submitCreateWorker">Create Worker</button>
      </div>
    </div>

    <!-- Edit Worker Modal -->
    <div id="editWorkerModal" class="modal">
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h3>Edit Worker Script</h3>
          <button class="modal-close-btn" id="cancelEditWorker">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Worker Name:</label>
          <input type="text" class="form-input" id="editWorkerName" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Account:</label>
          <input type="text" class="form-input" id="editWorkerAccount" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Script Content:</label>
          <textarea class="form-input form-textarea" id="editWorkerScript" placeholder="Loading script..."></textarea>
        </div>
        <div>
          <button class="btn btn-success" id="submitEditWorker">Update Worker</button>
          <button class="btn" id="reloadScriptBtn">Reload Script</button>
        </div>
      </div>
    </div>

    <!-- Bulk Create Modal -->
    <div id="bulkCreateModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Bulk Create Workers</h3>
          <button class="modal-close-btn" id="cancelBulkCreate">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Select Accounts (multiple):</label>
          <select class="form-input" id="bulkAccountsSelect" multiple style="height: 150px;"></select>
          <small>Hold Ctrl/Cmd to select multiple accounts</small>
        </div>
        <div class="form-group">
          <label class="form-label">Worker Name:</label>
          <input type="text" class="form-input" id="bulkWorkerName" placeholder="my-worker">
        </div>
        <div class="form-group">
          <label class="form-label">Select Template:</label>
          <select class="form-input" id="bulkWorkerTemplate">
            <option value="custom">Custom URL</option>
            <option value="proxy-checker">PROXY CHECKER</option>
            <option value="nautica-mod">NAUTICA MOD</option>
            <option value="nautica">NAUTICA</option>
            <option value="Gateway">Gateway</option>
            <option value="GatewayMod">GatewayMod</option>
            <option value="vmess">Vmess</option>
           <option value="vmessMod">VmessMod</option>
           <option value="Green-jossvpn">Green-jossvpn</option>
          </select>
        </div>
        <div class="form-group" id="bulkCustomUrlGroup">
          <label class="form-label">Script URL (optional):</label>
          <input type="text" class="form-input" id="bulkScriptUrl" value="https://r2.lifetime69.workers.dev/raw/ffdr6xgncp7mkfcd6mj">
          <small style="color: #ccc;">Nama file GitHub bisa bebas, tidak harus worker.js</small>
        </div>
        
        <!-- Proxy IP Info untuk Bulk NAUTICA -->
        <div id="bulkProxyInfo" class="proxy-info" style="display: none;">
          <h4>🔒 NAUTICA Proxy Information</h4>
          <p>Template NAUTICA akan menggunakan proxy IP acak dari:</p>
          <p><code>https://r2.lifetime69.workers.dev/raw/bj3yy7362a9mkfcjltj</code></p>
          <p>Setiap worker akan mendapatkan proxy IP yang berbeda secara acak.</p>
        </div>
        
        <div class="progress-bar">
          <div class="progress" id="bulkProgress"></div>
        </div>
        <div id="bulkResults"></div>
        <button class="btn btn-success" id="submitBulkCreate">Start Bulk Create</button>
      </div>
    </div>

    <!-- Wildcard Domain Modal -->
    <div id="wildcardModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>🌐 Wildcard Domain Registration</h3>
          <button class="modal-close-btn" id="cancelWildcard">×</button>
        </div>
        
        <div class="form-group">
          <label class="form-label">Select Account:</label>
          <select class="form-input" id="wildcardAccountSelect"></select>
        </div>

        <!-- Dropdown untuk memilih Worker -->
        <div class="form-group">
          <label class="form-label">Select Worker:</label>
          <select class="form-input" id="wildcardWorkerSelect">
            <option value="">Loading workers...</option>
          </select>
          <small style="color: #ccc;">Pilih worker yang akan menangani domain wildcard</small>
        </div>
        
        <div class="form-group">
          <label class="form-label">Full Domain to Register:</label>
          <input type="text" class="form-input" id="fullSubdomain" placeholder="contoh: api.example.com atau *.example.com">
          <small style="color: #ccc;">Masukkan lengkap domain yang ingin didaftarkan. Untuk wildcard gunakan format: *.example.com</small>
        </div>
        
        <!-- Auto-detected info -->
        <div id="autoDetectedInfo" style="display: none; background: #1a3a5f; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h4>🔍 Auto-Detected Configuration:</h4>
          <div class="user-info-item">
            <span class="user-info-label">Account ID:</span>
            <span class="user-info-value" id="detectedAccountId">-</span>
          </div>
          <div class="user-info-item">
            <span class="user-info-label">Zone ID:</span>
            <span class="user-info-value" id="detectedZoneId">-</span>
          </div>
          <div class="user-info-item">
            <span class="user-info-label">Service Name:</span>
            <span class="user-info-value" id="detectedServiceName">-</span>
          </div>
          <div class="user-info-item">
            <span class="user-info-label">Root Domain:</span>
            <span class="user-info-value" id="detectedRootDomain">-</span>
          </div>
        </div>
        
        <div id="wildcardResult" style="display:none;"></div>
        
        <div class="form-group">
          <button class="btn btn-success" id="submitWildcard">Register Domain</button>
          <button class="btn btn-info" id="listWildcardBtn">List Registered Domains</button>
          <button class="btn btn-warning" id="autoDiscoverBtn">Auto Discover Config</button>
        </div>
        
        <div id="wildcardList" style="margin-top: 20px; display: none;">
          <h4>Registered Domains:</h4>
          <div id="domainsList" style="max-height: 200px; overflow-y: auto; background: #3d3d3d; padding: 10px; border-radius: 5px;"></div>
        </div>
      </div>
    </div>

    <!-- Bulk Actions Modal -->
    <div id="bulkActionsModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Bulk Operations</h3>
          <button class="modal-close-btn" id="cancelBulkActions">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Selected Workers: <span id="bulkSelectedCount">0</span></label>
          <div id="bulkSelectedList" style="max-height: 200px; overflow-y: auto; background: #3d3d3d; padding: 10px; border-radius: 5px;"></div>
        </div>
        <div class="form-group">
          <button class="btn btn-danger" id="bulkDeleteBtn" style="width: 100%;">Delete Selected Workers</button>
        </div>
      </div>
    </div>

    <!-- Analytics Modal -->
    <div id="analyticsModal" class="modal">
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h3>Worker Analytics</h3>
          <button class="modal-close-btn" id="cancelAnalytics">×</button>
        </div>
        <div class="tabs">
          <div class="tab active" data-tab="overview">Overview</div>
          <div class="tab" data-tab="performance">Performance</div>
          <div class="tab" data-tab="requests">Requests</div>
        </div>
        
        <div class="tab-content active" id="overviewTab">
          <div class="analytics-grid">
            <div class="analytics-card">
              <div class="analytics-label">Total Requests</div>
              <div class="analytics-value" id="totalRequests">0</div>
            </div>
            <div class="analytics-card">
              <div class="analytics-label">Success Rate</div>
              <div class="analytics-value" id="successRate">0%</div>
            </div>
            <div class="analytics-card">
              <div class="analytics-label">Avg Response Time</div>
              <div class="analytics-value" id="avgResponseTime">0ms</div>
            </div>
            <div class="analytics-card">
              <div class="analytics-label">CPU Time</div>
              <div class="analytics-value" id="cpuTime">0ms</div>
            </div>
          </div>
        </div>

        <div class="tab-content" id="performanceTab">
          <h4>Performance Metrics</h4>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="analytics-label">P95 Response</div>
              <div class="analytics-value" id="p95Response">0ms</div>
            </div>
            <div class="stat-item">
              <div class="analytics-label">P99 Response</div>
              <div class="analytics-value" id="p99Response">0ms</div>
            </div>
            <div class="stat-item">
              <div class="analytics-label">Cache Hit Rate</div>
              <div class="analytics-value" id="cacheHitRate">0%</div>
            </div>
          </div>
        </div>

        <div class="tab-content" id="requestsTab">
          <h4>Request Distribution</h4>
          <div id="requestDistribution"></div>
        </div>
      </div>
    </div>

    <!-- User Details Modal -->
    <div id="userDetailModal" class="modal">
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <h3>👤 User Details & Account Information</h3>
          <button class="modal-close-btn" id="cancelUserDetail">×</button>
        </div>
        <div id="userDetailContent"></div>
      </div>
    </div>

    <!-- Config Results Modal -->
    <div id="configResultsModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Worker Configuration</h3>
          <button class="modal-close-btn" id="cancelConfigResults">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">Worker Name:</label>
          <input type="text" class="form-input" id="configWorkerName" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Account:</label>
          <input type="text" class="form-input" id="configWorkerAccount" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">Configuration:</label>
          <div id="configResultsContent"></div>
        </div>
      </div>
    </div>

    <!-- Export/Import Modal -->
    <div id="configModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Configuration Management</h3>
          <button class="modal-close-btn" id="cancelConfigModal">×</button>
        </div>
        <div class="tabs">
          <div class="tab active" data-tab="export">Export</div>
          <div class="tab" data-tab="import">Import</div>
        </div>
        
        <div class="tab-content active" id="exportTab">
          <div class="form-group">
            <label class="form-label">Configuration Data:</label>
            <textarea class="form-input form-textarea" id="exportData" readonly style="height: 300px;"></textarea>
          </div>
          <button class="btn btn-success" id="copyExportBtn">Copy to Clipboard</button>
          <button class="btn btn-info" id="downloadExportBtn">Download as File</button>
        </div>
        
        <div class="tab-content" id="importTab">
          <div class="form-group">
            <label class="form-label">Paste Configuration Data:</label>
            <textarea class="form-input form-textarea" id="importData" placeholder="Paste your configuration JSON here..." style="height: 300px;"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Or Upload Configuration File:</label>
            <input type="file" class="form-input" id="importFile" accept=".json">
          </div>
          <button class="btn btn-success" id="submitImportBtn">Import Configuration</button>
        </div>
      </div>
    </div>
  </div>

  <div id="bulkActionsBar" class="bulk-actions">
    <span id="bulkActionsText">0 workers selected</span>
    <div class="actions-dropdown">
      <button class="btn btn-danger btn-small">Bulk Actions ▼</button>
      <div class="dropdown-content">
        <a onclick="bulkDeleteWorkers()" class="delete-action">Delete Selected Workers</a>
      </div>
    </div>
    <button class="btn btn-warning btn-small" id="bulkBarCloseBtn">Close</button>
  </div>

  <div id="notification" class="notification"></div>

  <script>
    let users = JSON.parse(localStorage.getItem('cf_users') || '[]');
    let currentUserIndex = parseInt(localStorage.getItem('cf_current_user') || '0');
    let allWorkers = [];
    let selectedWorkers = new Set();
    let currentEditingWorker = null;
    let autoRefreshInterval = null;
    let currentSearchTerm = '';
    let currentFilterAccount = '';
    let currentWildcardConfig = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
      setupEventListeners();
      if (users.length > 0) {
        updateUI();
        fetchAllWorkers();
      }
    });

    function setupEventListeners() {
      document.getElementById('loginBtn').addEventListener('click', function() {
        document.getElementById('loginForm').style.display = 'block';
      });

      document.getElementById('submitLogin').addEventListener('click', login);
      document.getElementById('logoutBtn').addEventListener('click', logoutCurrent);
      document.getElementById('logoutAllBtn').addEventListener('click', logoutAll);
      document.getElementById('userDetailBtn').addEventListener('click', showUserDetail);
      document.getElementById('createWorkerBtn').addEventListener('click', showCreateWorkerModal);
      document.getElementById('bulkCreateBtn').addEventListener('click', showBulkCreateModal);
      document.getElementById('wildcardBtn').addEventListener('click', showWildcardModal);
      document.getElementById('exportConfigBtn').addEventListener('click', showExportConfig);
      
      // Close buttons - FIXED: Added proper event listeners
      document.getElementById('cancelCreateWorker').addEventListener('click', hideCreateWorkerModal);
      document.getElementById('cancelEditWorker').addEventListener('click', hideEditWorkerModal);
      document.getElementById('cancelBulkCreate').addEventListener('click', hideBulkCreateModal);
      document.getElementById('cancelWildcard').addEventListener('click', hideWildcardModal);
      document.getElementById('cancelBulkActions').addEventListener('click', hideBulkActionsModal);
      document.getElementById('cancelAnalytics').addEventListener('click', hideAnalyticsModal);
      document.getElementById('cancelUserDetail').addEventListener('click', hideUserDetailModal);
      document.getElementById('cancelConfigResults').addEventListener('click', hideConfigResultsModal);
      document.getElementById('cancelConfigModal').addEventListener('click', hideConfigModal);
      
      document.getElementById('submitCreateWorker').addEventListener('click', createWorker);
      document.getElementById('refreshWorkers').addEventListener('click', fetchAllWorkers);
      document.getElementById('selectAllBtn').addEventListener('click', selectAllWorkers);
      document.getElementById('deselectAllBtn').addEventListener('click', deselectAllWorkers);
      document.getElementById('analyticsBtn').addEventListener('click', showAnalyticsModal);
      document.getElementById('submitEditWorker').addEventListener('click', updateWorker);
      document.getElementById('reloadScriptBtn').addEventListener('click', reloadWorkerScript);
      document.getElementById('submitBulkCreate').addEventListener('click', bulkCreateWorkers);
      document.getElementById('submitWildcard').addEventListener('click', registerWildcard);
      document.getElementById('listWildcardBtn').addEventListener('click', listWildcardDomains);
      document.getElementById('autoDiscoverBtn').addEventListener('click', autoDiscoverConfig);
      document.getElementById('bulkDeleteBtn').addEventListener('click', bulkDeleteWorkers);
      document.getElementById('bulkBarCloseBtn').addEventListener('click', closeBulkActions);
      document.getElementById('copyExportBtn').addEventListener('click', copyExportData);
      document.getElementById('downloadExportBtn').addEventListener('click', downloadExportData);
      document.getElementById('submitImportBtn').addEventListener('click', importConfig);

      // Template selection untuk proxy IP info
      document.getElementById('workerTemplate').addEventListener('change', function(e) {
        document.getElementById('customUrlGroup').style.display = e.target.value === 'custom' ? 'block' : 'none';
        updateProxyInfoDisplay(e.target.value);
      });

      document.getElementById('bulkWorkerTemplate').addEventListener('change', function(e) {
        document.getElementById('bulkCustomUrlGroup').style.display = e.target.value === 'custom' ? 'block' : 'none';
        updateBulkProxyInfoDisplay(e.target.value);
      });

      // Refresh proxy IP button
      document.getElementById('refreshProxyBtn').addEventListener('click', refreshProxyIP);

      // Search and filter
      document.getElementById('searchWorkers').addEventListener('input', function(e) {
        currentSearchTerm = e.target.value.toLowerCase();
        displayWorkers();
      });

      document.getElementById('filterAccount').addEventListener('change', function(e) {
        currentFilterAccount = e.target.value;
        displayWorkers();
      });

      document.getElementById('clearSearch').addEventListener('click', function() {
        document.getElementById('searchWorkers').value = '';
        document.getElementById('filterAccount').value = '';
        currentSearchTerm = '';
        currentFilterAccount = '';
        displayWorkers();
      });

      // Auto-refresh
      document.getElementById('autoRefreshToggle').addEventListener('change', function(e) {
        toggleAutoRefresh(e.target.checked);
      });

      // File import
      document.getElementById('importFile').addEventListener('change', handleFileImport);

      // Tabs
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function(e) {
          const tabName = e.target.dataset.tab;
          switchTab(tabName);
        });
      });

      // Wildcard account change
      document.getElementById('wildcardAccountSelect').addEventListener('change', function() {
        const userIndex = this.value;
        if (userIndex !== '') {
          document.getElementById('autoDetectedInfo').style.display = 'none';
          document.getElementById('wildcardResult').style.display = 'none';
          document.getElementById('wildcardList').style.display = 'none';
          document.getElementById('wildcardWorkerSelect').innerHTML = '<option value="">Loading workers...</option>';
          currentWildcardConfig = null;
          
          // Load workers untuk dropdown
          loadWildcardWorkers(parseInt(userIndex));
        }
      });

      // Close modal when clicking outside
      document.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
          event.target.style.display = 'none';
        }
      });
    }

    // Fungsi untuk update display proxy info
    function updateProxyInfoDisplay(template) {
      const proxyInfo = document.getElementById('proxyInfo');
      if (template === 'nautica' || template === 'nautica-mod') {
        proxyInfo.style.display = 'block';
        refreshProxyIP();
      } else {
        proxyInfo.style.display = 'none';
      }
    }

    function updateBulkProxyInfoDisplay(template) {
      const bulkProxyInfo = document.getElementById('bulkProxyInfo');
      if (template === 'nautica' || template === 'nautica-mod') {
        bulkProxyInfo.style.display = 'block';
      } else {
        bulkProxyInfo.style.display = 'none';
      }
    }

    // Fungsi untuk refresh proxy IP
    async function refreshProxyIP() {
      const proxyIPElement = document.getElementById('currentProxyIP');
      proxyIPElement.textContent = 'Loading...';
      
      try {
        const response = await fetch('/api/generateProxyIP');
        const result = await response.json();
        
        if (result.success) {
          proxyIPElement.textContent = result.proxyIP;
        } else {
          proxyIPElement.textContent = 'Error loading proxy IP';
        }
      } catch (error) {
        proxyIPElement.textContent = 'Error loading proxy IP';
      }
    }

    // Fungsi untuk menampilkan modal wildcard
    function showWildcardModal() {
      const modal = document.getElementById('wildcardModal');
      const accountSelect = document.getElementById('wildcardAccountSelect');
      
      // Isi dropdown dengan akun yang tersedia
      accountSelect.innerHTML = '';
      users.forEach((user, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = user.email + ' (' + (user.accountId || 'Auto-detect') + ')';
        accountSelect.appendChild(option);
      });
      
      // Reset form
      document.getElementById('fullSubdomain').value = '';
      document.getElementById('wildcardWorkerSelect').innerHTML = '<option value="">Select account first</option>';
      document.getElementById('autoDetectedInfo').style.display = 'none';
      document.getElementById('wildcardResult').style.display = 'none';
      document.getElementById('wildcardList').style.display = 'none';
      
      currentWildcardConfig = null;
      
      modal.style.display = 'flex';
      
      // Load workers untuk akun pertama
      if (users.length > 0) {
        loadWildcardWorkers(0);
      }
    }

    function hideWildcardModal() {
      document.getElementById('wildcardModal').style.display = 'none';
    }

    // Fungsi untuk memuat workers ke dropdown
    async function loadWildcardWorkers(userIndex) {
      const user = users[userIndex];
      const workerSelect = document.getElementById('wildcardWorkerSelect');
      
      if (!user.accountId) {
        workerSelect.innerHTML = '<option value="">No account ID available</option>';
        return;
      }
      
      showNotification('Loading workers...');
      
      try {
        const response = await fetch('/api/listWorkers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: user.accountId
          })
        });
        
        const result = await response.json();
        
        if (result.success && result.result && result.result.length > 0) {
          workerSelect.innerHTML = '';
          result.result.forEach(worker => {
            const option = document.createElement('option');
            option.value = worker.id;
            option.textContent = worker.id;
            workerSelect.appendChild(option);
          });
          showNotification('Workers loaded successfully');
        } else {
          workerSelect.innerHTML = '<option value="">No workers found</option>';
          showNotification('No workers found for this account', 'warning');
        }
      } catch (error) {
        workerSelect.innerHTML = '<option value="">Error loading workers</option>';
        showNotification('Error loading workers: ' + error.message, 'error');
      }
    }

    // Fungsi untuk auto-discover configuration
    async function autoDiscoverConfig() {
      const accountIndex = document.getElementById('wildcardAccountSelect').value;
      const subdomain = document.getElementById('fullSubdomain').value;
      
      if (!accountIndex) {
        showNotification('Please select an account first', 'error');
        return;
      }
      
      const user = users[accountIndex];
      
      if (!user.accountId) {
        showNotification('Selected account has no Account ID', 'error');
        return;
      }
      
      showNotification('Auto-discovering configuration...');
      
      try {
        const response = await fetch('/api/autoDiscoverConfig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: user.accountId,
            targetDomain: subdomain
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          currentWildcardConfig = {
            accountId: result.accountId,
            zoneId: result.zone ? result.zone.id : null,
            serviceName: result.service ? result.service.id : null,
            rootDomain: result.zone ? result.zone.name : null,
            appDomain: result.zone ? result.zone.name : null
          };
          
          // Update UI dengan informasi yang terdeteksi
          document.getElementById('detectedAccountId').textContent = result.accountId || '-';
          document.getElementById('detectedZoneId').textContent = (result.zone && result.zone.id) || '-';
          document.getElementById('detectedServiceName').textContent = (result.service && result.service.id) || '-';
          document.getElementById('detectedRootDomain').textContent = (result.zone && result.zone.name) || '-';
          document.getElementById('autoDetectedInfo').style.display = 'block';
          
          showNotification('Configuration auto-discovered successfully!');
          
          // Jika ada domain yang dimasukkan, beri saran
          if (subdomain && result.zone) {
            const domainParts = subdomain.split('.');
            const suggestedDomain = '*.' + result.zone.name;
            if (!subdomain.includes('*') && domainParts.slice(-2).join('.') === result.zone.name) {
              document.getElementById('fullSubdomain').placeholder = 'Contoh: ' + suggestedDomain;
            }
          }
        } else {
          showNotification('Auto-discovery failed: ' + result.message, 'error');
        }
      } catch (error) {
        showNotification('Error during auto-discovery: ' + error.message, 'error');
      }
    }

    // Fungsi untuk mendaftarkan wildcard domain
    async function registerWildcard() {
      const accountIndex = document.getElementById('wildcardAccountSelect').value;
      const workerName = document.getElementById('wildcardWorkerSelect').value;
      const fullSubdomain = document.getElementById('fullSubdomain').value;
      
      if (!accountIndex || !workerName || !fullSubdomain) {
        showNotification('Please select account, worker, and enter domain', 'error');
        return;
      }
      
      const user = users[accountIndex];
      
      if (!user.accountId) {
        showNotification('Selected account has no Account ID', 'error');
        return;
      }
      
      showNotification('Registering domain...');
      
      try {
        const response = await fetch('/api/registerWildcard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: user.accountId,
            zoneId: currentWildcardConfig ? currentWildcardConfig.zoneId : null,
            serviceName: workerName, // Gunakan worker yang dipilih dari dropdown
            subdomain: fullSubdomain
          })
        });
        
        const result = await response.json();
        
        const resultDiv = document.getElementById('wildcardResult');
        resultDiv.style.display = 'block';
        
        if (result.success) {
          resultDiv.innerHTML = '<div class="simple-notification">' + result.message + '</div>';
          showNotification('Domain registered successfully!');
          
          // Clear form
          document.getElementById('fullSubdomain').value = '';
          
          // Refresh config
          autoDiscoverConfig();
        } else {
          resultDiv.innerHTML = '<div class="notification error">' + result.message + '</div>';
          showNotification('Failed to register domain: ' + result.message, 'error');
        }
      } catch (error) {
        showNotification('Error: ' + error.message, 'error');
      }
    }

    // Fungsi untuk menampilkan daftar domain
    async function listWildcardDomains() {
      const accountIndex = document.getElementById('wildcardAccountSelect').value;
      const workerName = document.getElementById('wildcardWorkerSelect').value;
      
      if (!accountIndex || !workerName) {
        showNotification('Please select an account and a worker first', 'error');
        return;
      }
      
      const user = users[accountIndex];
      
      if (!user.accountId) {
        showNotification('Selected account has no Account ID', 'error');
        return;
      }
      
      showNotification('Loading registered domains...');
      
      try {
        const response = await fetch('/api/listWildcard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: user.accountId,
            zoneId: currentWildcardConfig ? currentWildcardConfig.zoneId : null,
            serviceName: workerName // Gunakan worker yang dipilih dari dropdown
          })
        });
        
        const result = await response.json();
        
        const domainsList = document.getElementById('domainsList');
        const wildcardList = document.getElementById('wildcardList');
        
        if (result.success) {
          if (result.domains && result.domains.length > 0) {
            domainsList.innerHTML = result.domains.map(function(domain) {
              return '<div class="wildcard-domain-item">' +
                '<span>' + domain + '</span>' +
                '<div class="wildcard-domain-actions">' +
                '<button class="btn btn-small copy-btn" onclick="copyToClipboard(\'' + domain + '\')">📋</button>' +
                '<button class="btn btn-small" onclick="window.open(\'https://' + domain + '\', \'_blank\')">🌍</button>' +
                '</div>' +
                '</div>';
            }).join('');
          } else {
            domainsList.innerHTML = '<p>No domains registered for this worker</p>';
          }
          
          // Update current config dengan yang dari server
          if (result.config) {
            currentWildcardConfig = Object.assign({}, currentWildcardConfig, result.config);
            updateDetectedInfo();
          }
        } else {
          domainsList.innerHTML = '<p style="color: #ff6b6b;">Error: ' + result.message + '</p>';
        }
        
        wildcardList.style.display = 'block';
        showNotification('Domains loaded successfully');
      } catch (error) {
        showNotification('Error loading domains: ' + error.message, 'error');
      }
    }

    // Fungsi untuk update info yang terdeteksi
    function updateDetectedInfo() {
      if (currentWildcardConfig) {
        document.getElementById('detectedAccountId').textContent = currentWildcardConfig.accountId || '-';
        document.getElementById('detectedZoneId').textContent = currentWildcardConfig.zoneId || '-';
        document.getElementById('detectedServiceName').textContent = currentWildcardConfig.serviceName || '-';
        document.getElementById('detectedRootDomain').textContent = currentWildcardConfig.rootDomain || '-';
        document.getElementById('autoDetectedInfo').style.display = 'block';
      }
    }

    // Fungsi-fungsi utama
    async function login() {
      const email = document.getElementById('email').value;
      const apiKey = document.getElementById('apiKey').value;

      if (!email || !apiKey) {
        showNotification('Email and API key are required', 'error');
        return;
      }

      showNotification('Logging in...');

      try {
        const response = await fetch('/api/userInfo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, globalAPIKey: apiKey })
        });

        const result = await response.json();

        if (result.success) {
          const accountsResponse = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, globalAPIKey: apiKey })
          });

          const accountsResult = await accountsResponse.json();

          if (accountsResult.success) {
            const user = {
              email: email,
              apiKey: apiKey,
              userInfo: result.result,
              accounts: accountsResult.result,
              accountId: accountsResult.result[0] ? accountsResult.result[0].id : null,
              id: Date.now().toString()
            };

            const existingUserIndex = users.findIndex(function(u) { return u.email === email; });
            if (existingUserIndex >= 0) {
              users[existingUserIndex] = user;
              currentUserIndex = existingUserIndex;
            } else {
              users.push(user);
              currentUserIndex = users.length - 1;
            }

            localStorage.setItem('cf_users', JSON.stringify(users));
            localStorage.setItem('cf_current_user', currentUserIndex.toString());

            updateUI();
            fetchAllWorkers();
            showNotification('Login successful!');

            document.getElementById('email').value = '';
            document.getElementById('apiKey').value = '';
          } else {
            throw new Error(accountsResult.errors && accountsResult.errors[0] ? accountsResult.errors[0].message : 'Failed to fetch accounts');
          }
        } else {
          throw new Error(result.errors && result.errors[0] ? result.errors[0].message : 'Invalid credentials');
        }
      } catch (error) {
        showNotification('Login failed: ' + error.message, 'error');
      }
    }

    function logoutCurrent() {
      if (users.length > 0) {
        users.splice(currentUserIndex, 1);
        if (users.length > 0) {
          currentUserIndex = 0;
          localStorage.setItem('cf_users', JSON.stringify(users));
          localStorage.setItem('cf_current_user', currentUserIndex.toString());
        } else {
          localStorage.removeItem('cf_users');
          localStorage.removeItem('cf_current_user');
          currentUserIndex = 0;
        }
        updateUI();
        showNotification('Logged out successfully');
      }
    }

    function logoutAll() {
      users = [];
      localStorage.removeItem('cf_users');
      localStorage.removeItem('cf_current_user');
      currentUserIndex = 0;
      updateUI();
      showNotification('All accounts logged out');
    }

    function updateUI() {
      const hasUsers = users.length > 0;
      
      // Update account status
      document.getElementById('statusText').textContent = hasUsers ? 'Logged In' : 'Not Logged In';
      document.getElementById('loginForm').style.display = hasUsers ? 'none' : 'block';
      document.getElementById('accountInfo').style.display = hasUsers ? 'block' : 'none';
      document.getElementById('workersSection').style.display = hasUsers ? 'block' : 'none';
      document.getElementById('accountsPanel').style.display = hasUsers ? 'block' : 'none';
      
      // Update buttons visibility
      document.getElementById('createWorkerBtn').style.display = hasUsers ? 'inline-block' : 'none';
      document.getElementById('bulkCreateBtn').style.display = hasUsers ? 'inline-block' : 'none';
      document.getElementById('wildcardBtn').style.display = hasUsers ? 'inline-block' : 'none';
      document.getElementById('exportConfigBtn').style.display = hasUsers ? 'inline-block' : 'none';
      document.getElementById('bulkActionsDropdown').style.display = hasUsers ? 'inline-block' : 'none';
      
      if (hasUsers) {
        const currentUser = users[currentUserIndex];
        document.getElementById('userEmail').textContent = currentUser.email;
        
        // Update accounts dropdown
        const accountSelect = document.getElementById('accountSelect');
        accountSelect.innerHTML = '';
        if (currentUser.accounts && currentUser.accounts.length > 0) {
          currentUser.accounts.forEach(function(account) {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.name + ' (' + account.id + ')';
            if (account.id === currentUser.accountId) {
              option.selected = true;
            }
            accountSelect.appendChild(option);
          });
        }
        
        // Update current account display
        document.getElementById('currentAccountEmail').textContent = currentUser.email;
        
        // Update accounts dropdown list
        const accountsDropdownList = document.getElementById('accountsDropdownList');
        accountsDropdownList.innerHTML = '';
        users.forEach(function(user, index) {
          const accountItem = document.createElement('div');
          accountItem.className = 'account-item' + (index === currentUserIndex ? ' active' : '');
          accountItem.innerHTML = '<span>' + user.email + '</span>' +
            '<span class="remove" onclick="event.stopPropagation(); logoutUser(' + index + ')">×</span>';
          accountItem.addEventListener('click', function() { switchUser(index); });
          accountsDropdownList.appendChild(accountItem);
        });
        
        // Update other accounts count
        const otherAccountsCount = document.getElementById('otherAccountsCount');
        otherAccountsCount.textContent = (users.length - 1).toString();
        document.getElementById('otherAccounts').style.display = users.length > 1 ? 'block' : 'none';
        
        // Update filter dropdown
        const filterAccount = document.getElementById('filterAccount');
        filterAccount.innerHTML = '<option value="">All Accounts</option>';
        users.forEach(function(user) {
          const option = document.createElement('option');
          option.value = user.email;
          option.textContent = user.email;
          filterAccount.appendChild(option);
        });
      }
    }

    function switchUser(index) {
      currentUserIndex = index;
      localStorage.setItem('cf_current_user', currentUserIndex.toString());
      updateUI();
      fetchAllWorkers();
      showNotification('Switched to account: ' + users[index].email);
    }

    function logoutUser(index) {
      if (users.length > 1) {
        users.splice(index, 1);
        if (currentUserIndex >= index && currentUserIndex > 0) {
          currentUserIndex--;
        }
        localStorage.setItem('cf_users', JSON.stringify(users));
        localStorage.setItem('cf_current_user', currentUserIndex.toString());
        updateUI();
        fetchAllWorkers();
        showNotification('Account logged out');
      } else {
        logoutAll();
      }
    }

    async function fetchAllWorkers() {
      if (users.length === 0) return;
      
      showNotification('Fetching workers...');
      document.getElementById('workersList').classList.add('loading');
      
      try {
        const workerPromises = users.map(function(user) {
          return fetch('/api/listWorkers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              globalAPIKey: user.apiKey,
              accountId: user.accountId
            })
          }).then(function(res) { return res.json(); }).then(function(data) {
            return {
              user: user.email,
              accountId: user.accountId,
              workers: data.result || []
            };
          });
        });
        
        const results = await Promise.all(workerPromises);
        allWorkers = results.flatMap(function(result) {
          return result.workers.map(function(worker) {
            return Object.assign({}, worker, {
              account: result.user,
              accountId: result.accountId
            });
          });
        });
        
        displayWorkers();
        showNotification('Workers loaded successfully');
      } catch (error) {
        showNotification('Error fetching workers: ' + error.message, 'error');
      } finally {
        document.getElementById('workersList').classList.remove('loading');
      }
    }

    function displayWorkers() {
      const workersList = document.getElementById('workersList');
      
      if (allWorkers.length === 0) {
        workersList.innerHTML = '<p>No workers found</p>';
        return;
      }
      
      // Filter workers berdasarkan search dan filter
      let filteredWorkers = allWorkers;
      
      if (currentSearchTerm) {
        filteredWorkers = filteredWorkers.filter(function(worker) {
          return worker.id.toLowerCase().includes(currentSearchTerm);
        });
      }
      
      if (currentFilterAccount) {
        filteredWorkers = filteredWorkers.filter(function(worker) {
          return worker.account === currentFilterAccount;
        });
      }
      
      if (filteredWorkers.length === 0) {
        workersList.innerHTML = '<p>No workers match your search criteria</p>';
        return;
      }
      
      workersList.innerHTML = filteredWorkers.map(function(worker) {
        const isSelected = selectedWorkers.has(worker.id);
        return '<div class="worker-item' + (isSelected ? ' selected' : '') + '" data-worker-id="' + worker.id + '">' +
          '<div class="worker-info">' +
          '<input type="checkbox" class="worker-checkbox" ' + (isSelected ? 'checked' : '') + 
          ' onchange="toggleWorkerSelection(\'' + worker.id + '\', this.checked)">' +
          '<div class="worker-name">' + worker.id + '</div>' +
          '<div class="account-email">Account: ' + worker.account + '</div>' +
          '<div class="account-email">Created: ' + new Date(worker.created_on).toLocaleDateString() + '</div>' +
          '</div>' +
          '<div class="worker-actions">' +
          '<div class="actions-dropdown">' +
          '<button class="btn btn-small">Actions ▼</button>' +
          '<div class="dropdown-content">' +
          '<a onclick="viewWorkerConfig(\'' + worker.id + '\', \'' + worker.account + '\')">View Config</a>' +
          '<a onclick="editWorker(\'' + worker.id + '\', \'' + worker.account + '\', \'' + worker.accountId + '\')">Edit Script</a>' +
          '<a onclick="showWorkerAnalytics(\'' + worker.id + '\', \'' + worker.account + '\')">Analytics</a>' +
          '<a class="delete-action" onclick="deleteWorker(\'' + worker.id + '\', \'' + worker.account + '\', \'' + worker.accountId + '\')">Delete</a>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }).join('');
      
      // Update selected count
      updateSelectedCount();
    }

    function toggleWorkerSelection(workerId, selected) {
      if (selected) {
        selectedWorkers.add(workerId);
      } else {
        selectedWorkers.delete(workerId);
      }
      displayWorkers();
      updateBulkActionsBar();
    }

    function selectAllWorkers() {
      const filteredWorkers = getFilteredWorkers();
      filteredWorkers.forEach(function(worker) {
        selectedWorkers.add(worker.id);
      });
      displayWorkers();
      updateBulkActionsBar();
    }

    function deselectAllWorkers() {
      selectedWorkers.clear();
      displayWorkers();
      updateBulkActionsBar();
    }

    function getFilteredWorkers() {
      let filteredWorkers = allWorkers;
      
      if (currentSearchTerm) {
        filteredWorkers = filteredWorkers.filter(function(worker) {
          return worker.id.toLowerCase().includes(currentSearchTerm);
        });
      }
      
      if (currentFilterAccount) {
        filteredWorkers = filteredWorkers.filter(function(worker) {
          return worker.account === currentFilterAccount;
        });
      }
      
      return filteredWorkers;
    }

    function updateSelectedCount() {
      const selectedCount = document.getElementById('selectedCount');
      const selectedCountNumber = document.getElementById('selectedCountNumber');
      
      if (selectedWorkers.size > 0) {
        selectedCountNumber.textContent = selectedWorkers.size.toString();
        selectedCount.style.display = 'inline-block';
      } else {
        selectedCount.style.display = 'none';
      }
    }

    function updateBulkActionsBar() {
      const bulkActionsBar = document.getElementById('bulkActionsBar');
      const bulkActionsText = document.getElementById('bulkActionsText');
      
      if (selectedWorkers.size > 0) {
        bulkActionsText.textContent = selectedWorkers.size + ' workers selected';
        bulkActionsBar.classList.add('active');
      } else {
        bulkActionsBar.classList.remove('active');
      }
    }

    function closeBulkActions() {
      selectedWorkers.clear();
      displayWorkers();
      updateBulkActionsBar();
    }

    function showBulkActionsModal() {
      if (selectedWorkers.size === 0) {
        showNotification('Please select workers first', 'error');
        return;
      }
      
      const modal = document.getElementById('bulkActionsModal');
      const bulkSelectedCount = document.getElementById('bulkSelectedCount');
      const bulkSelectedList = document.getElementById('bulkSelectedList');
      
      bulkSelectedCount.textContent = selectedWorkers.size.toString();
      
      const selectedWorkerDetails = allWorkers.filter(function(worker) {
        return selectedWorkers.has(worker.id);
      });
      bulkSelectedList.innerHTML = selectedWorkerDetails.map(function(worker) {
        return '<div style="padding: 5px; border-bottom: 1px solid #444;">' +
          '<strong>' + worker.id + '</strong> - ' + worker.account +
          '</div>';
      }).join('');
      
      modal.style.display = 'flex';
    }

    function hideBulkActionsModal() {
      document.getElementById('bulkActionsModal').style.display = 'none';
    }

    async function bulkDeleteWorkers() {
      if (selectedWorkers.size === 0) {
        showNotification('No workers selected', 'error');
        return;
      }
      
      if (!confirm('Are you sure you want to delete ' + selectedWorkers.size + ' workers? This action cannot be undone.')) {
        return;
      }
      
      showNotification('Deleting selected workers...');
      
      const selectedWorkerDetails = allWorkers.filter(function(worker) {
        return selectedWorkers.has(worker.id);
      });
      const userGroups = {};
      
      // Group workers by user account
      selectedWorkerDetails.forEach(function(worker) {
        if (!userGroups[worker.account]) {
          userGroups[worker.account] = [];
        }
        userGroups[worker.account].push(worker);
      });
      
      try {
        const deletePromises = [];
        
        for (const email in userGroups) {
          if (userGroups.hasOwnProperty(email)) {
            const user = users.find(function(u) { return u.email === email; });
            if (user) {
              const workerNames = userGroups[email].map(function(w) { return w.id; });
              
              deletePromises.push(
                fetch('/api/bulkDeleteWorkers', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: user.email,
                    globalAPIKey: user.apiKey,
                    accountId: user.accountId,
                    workerNames: workerNames
                  })
                }).then(function(res) { return res.json(); })
              );
            }
          }
        }
        
        const results = await Promise.all(deletePromises);
        const allSuccess = results.every(function(r) { return r.success; });
        
        if (allSuccess) {
          showNotification('Successfully deleted ' + selectedWorkers.size + ' workers');
          selectedWorkers.clear();
          fetchAllWorkers();
          hideBulkActionsModal();
        } else {
          showNotification('Some workers failed to delete', 'error');
        }
      } catch (error) {
        showNotification('Error deleting workers: ' + error.message, 'error');
      }
    }

    function showCreateWorkerModal() {
      const modal = document.getElementById('createWorkerModal');
      const accountSelect = document.getElementById('createAccountSelect');
      
      accountSelect.innerHTML = '';
      users.forEach(function(user, index) {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = user.email + ' (' + (user.accountId || 'No account selected') + ')';
        accountSelect.appendChild(option);
      });
      
      modal.style.display = 'flex';
    }

    function hideCreateWorkerModal() {
      document.getElementById('createWorkerModal').style.display = 'none';
    }

    async function createWorker() {
      const accountIndex = document.getElementById('createAccountSelect').value;
      const workerName = document.getElementById('workerName').value;
      const template = document.getElementById('workerTemplate').value;
      const scriptUrl = document.getElementById('scriptUrl').value;
      
      if (!accountIndex || !workerName) {
        showNotification('Please select account and enter worker name', 'error');
        return;
      }
      
      const user = users[accountIndex];
      
      showNotification('Creating worker...');
      
      try {
        const response = await fetch('/api/createWorker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            workerName: workerName,
            workerScriptUrl: scriptUrl,
            accountId: user.accountId,
            template: template
          })
        });
        
        const result = await response.json();
        
        const resultDiv = document.getElementById('createResult');
        resultDiv.style.display = 'block';
        
        if (result.success) {
          let resultHTML = '<div class="simple-notification">' + result.message;
          if (result.proxyIP) {
            resultHTML += '<br><strong>Proxy IP:</strong> ' + result.proxyIP;
          }
          resultHTML += '</div>';
          
          if (result.url) {
            resultHTML += '<div class="config-display">' +
              '<div class="config-type">Worker URL:</div>' +
              '<div>' + result.url + '</div>';
            
            if (result.vless) {
              resultHTML += '<div class="config-type">VLESS Config:</div>' +
                '<div>' + result.vless + '</div>';
            }
            
            if (result.trojan) {
              resultHTML += '<div class="config-type">Trojan Config:</div>' +
                '<div>' + result.trojan + '</div>';
            }
            
            resultHTML += '</div>';
          }
          
          resultDiv.innerHTML = resultHTML;
          showNotification('Worker created successfully!');
          
          // Clear form
          document.getElementById('workerName').value = '';
          document.getElementById('scriptUrl').value = 'https://r2.lifetime69.workers.dev/raw/ffdr6xgncp7mkfcd6mj';
          
          // Refresh workers list
          setTimeout(function() { fetchAllWorkers(); }, 2000);
        } else {
          resultDiv.innerHTML = '<div class="notification error">' + result.message + '</div>';
          showNotification('Failed to create worker: ' + result.message, 'error');
        }
      } catch (error) {
        showNotification('Error: ' + error.message, 'error');
      }
    }

    function showBulkCreateModal() {
      const modal = document.getElementById('bulkCreateModal');
      const accountsSelect = document.getElementById('bulkAccountsSelect');
      
      accountsSelect.innerHTML = '';
      users.forEach(function(user, index) {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = user.email + ' (' + (user.accountId || 'No account selected') + ')';
        option.selected = true;
        accountsSelect.appendChild(option);
      });
      
      modal.style.display = 'flex';
    }

    function hideBulkCreateModal() {
      document.getElementById('bulkCreateModal').style.display = 'none';
    }

    async function bulkCreateWorkers() {
      const selectedAccounts = Array.from(document.getElementById('bulkAccountsSelect').selectedOptions);
      const workerName = document.getElementById('bulkWorkerName').value;
      const template = document.getElementById('bulkWorkerTemplate').value;
      const scriptUrl = document.getElementById('bulkScriptUrl').value;
      
      if (selectedAccounts.length === 0 || !workerName) {
        showNotification('Please select accounts and enter worker name', 'error');
        return;
      }
      
      const accounts = selectedAccounts.map(function(option) {
        const user = users[option.value];
        return {
          email: user.email,
          apiKey: user.apiKey,
          accountId: user.accountId
        };
      });
      
      showNotification('Starting bulk create...');
      
      const progressBar = document.getElementById('bulkProgress');
      const resultsDiv = document.getElementById('bulkResults');
      resultsDiv.innerHTML = '';
      resultsDiv.style.display = 'block';
      
      try {
        const response = await fetch('/api/bulkCreateWorkers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accounts: accounts,
            workerName: workerName,
            workerScriptUrl: scriptUrl,
            template: template
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          const successCount = result.results.filter(function(r) { return r.success; }).length;
          resultsDiv.innerHTML = '<div class="simple-notification">' +
            'Successfully created workers on ' + successCount + ' out of ' + result.results.length + ' accounts' +
            '</div>' +
            '<div style="max-height: 300px; overflow-y: auto; margin-top: 15px;">' +
            result.results.map(function(r) {
              return '<div style="padding: 10px; margin: 5px 0; background: ' + (r.success ? '#1a3a5f' : '#5a2a2a') + '; border-radius: 5px;">' +
                '<strong>' + r.email + '</strong>: ' + (r.success ? '✅ Success' : '❌ Failed') +
                (r.message ? '<br><small>' + r.message + '</small>' : '') +
                (r.proxyIP ? '<br><small>Proxy IP: ' + r.proxyIP + '</small>' : '') +
                '</div>';
            }).join('') +
            '</div>';
          showNotification('Bulk create completed!');
          
          // Refresh workers list
          setTimeout(function() { fetchAllWorkers(); }, 3000);
        } else {
          resultsDiv.innerHTML = '<div class="notification error">' + result.message + '</div>';
          showNotification('Bulk create failed: ' + result.message, 'error');
        }
      } catch (error) {
        resultsDiv.innerHTML = '<div class="notification error">Error: ' + error.message + '</div>';
        showNotification('Error during bulk create: ' + error.message, 'error');
      }
    }

    async function editWorker(workerName, accountEmail, accountId) {
      const user = users.find(function(u) { return u.email === accountEmail; });
      if (!user) {
        showNotification('User not found', 'error');
        return;
      }
      
      showNotification('Loading worker script...');
      
      try {
        const response = await fetch('/api/getWorkerScript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: accountId,
            workerName: workerName
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          currentEditingWorker = { workerName: workerName, accountEmail: accountEmail, accountId: accountId };
          
          document.getElementById('editWorkerName').value = workerName;
          document.getElementById('editWorkerAccount').value = accountEmail;
          document.getElementById('editWorkerScript').value = result.scriptContent;
          
          document.getElementById('editWorkerModal').style.display = 'flex';
          showNotification('Worker script loaded');
        } else {
          showNotification('Failed to load worker script: ' + result.message, 'error');
        }
      } catch (error) {
        showNotification('Error loading worker script: ' + error.message, 'error');
      }
    }

    function hideEditWorkerModal() {
      document.getElementById('editWorkerModal').style.display = 'none';
      currentEditingWorker = null;
    }

    async function reloadWorkerScript() {
      if (!currentEditingWorker) return;
      
      const workerName = currentEditingWorker.workerName;
      const accountEmail = currentEditingWorker.accountEmail;
      const accountId = currentEditingWorker.accountId;
      const user = users.find(function(u) { return u.email === accountEmail; });
      
      if (!user) {
        showNotification('User not found', 'error');
        return;
      }
      
      showNotification('Reloading worker script...');
      
      try {
        const response = await fetch('/api/getWorkerScript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: accountId,
            workerName: workerName
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          document.getElementById('editWorkerScript').value = result.scriptContent;
          showNotification('Worker script reloaded');
        } else {
          showNotification('Failed to reload worker script: ' + result.message, 'error');
        }
      } catch (error) {
        showNotification('Error reloading worker script: ' + error.message, 'error');
      }
    }

    async function updateWorker() {
      if (!currentEditingWorker) return;
      
      const workerName = currentEditingWorker.workerName;
      const accountEmail = currentEditingWorker.accountEmail;
      const accountId = currentEditingWorker.accountId;
      const user = users.find(function(u) { return u.email === accountEmail; });
      const scriptContent = document.getElementById('editWorkerScript').value;
      
      if (!user || !scriptContent) {
        showNotification('Invalid data', 'error');
        return;
      }
      
      showNotification('Updating worker...');
      
      try {
        const response = await fetch('/api/updateWorker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: accountId,
            workerName: workerName,
            scriptContent: scriptContent
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          showNotification('Worker updated successfully!');
          hideEditWorkerModal();
          fetchAllWorkers();
        } else {
          showNotification('Failed to update worker: ' + result.message, 'error');
        }
      } catch (error) {
        showNotification('Error updating worker: ' + error.message, 'error');
      }
    }

    async function deleteWorker(workerName, accountEmail, accountId) {
      if (!confirm('Are you sure you want to delete worker "' + workerName + '"? This action cannot be undone.')) {
        return;
      }
      
      const user = users.find(function(u) { return u.email === accountEmail; });
      if (!user) {
        showNotification('User not found', 'error');
        return;
      }
      
      showNotification('Deleting worker...');
      
      try {
        const response = await fetch('/api/deleteWorker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            globalAPIKey: user.apiKey,
            accountId: accountId,
            workerName: workerName
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          showNotification('Worker deleted successfully!');
          fetchAllWorkers();
        } else {
          showNotification('Failed to delete worker: ' + result.message, 'error');
        }
      } catch (error) {
        showNotification('Error deleting worker: ' + error.message, 'error');
      }
    }

    async function viewWorkerConfig(workerName, accountEmail) {
      // This would typically fetch the actual worker config
      // For now, we'll show a placeholder
      document.getElementById('configWorkerName').value = workerName;
      document.getElementById('configWorkerAccount').value = accountEmail;
      document.getElementById('configResultsContent').innerHTML = '<div class="config-display">' +
        '<div class="config-type">Worker Information:</div>' +
        '<div>Name: ' + workerName + '</div>' +
        '<div>Account: ' + accountEmail + '</div>' +
        '<div>Status: Active</div>' +
        '<div>Created: ' + new Date().toLocaleDateString() + '</div>' +
        '</div>' +
        '<div style="margin-top: 15px;">' +
        '<small>Note: Detailed configuration would be displayed here based on worker type and settings.</small>' +
        '</div>';
      
      document.getElementById('configResultsModal').style.display = 'flex';
    }

    function hideConfigResultsModal() {
      document.getElementById('configResultsModal').style.display = 'none';
    }

    function showUserDetail() {
      const currentUser = users[currentUserIndex];
      const userDetailContent = document.getElementById('userDetailContent');
      
      let userDetailHTML = '<div style="max-height: 70vh; overflow-y: auto;">';
      
      // Basic User Information
      userDetailHTML += '<h4>👤 Basic Information</h4>' +
        '<div class="user-info-item">' +
        '<span class="user-info-label">Email:</span>' +
        '<span class="user-info-value">' + currentUser.email + '</span>' +
        '</div>' +
        '<div class="user-info-item">' +
        '<span class="user-info-label">API Key:</span>' +
        '<span class="user-info-value">' +
        '<span class="api-key-masked">••••••••••••••••••••••</span>' +
        '<button class="btn copy-btn" onclick="copyToClipboard(\'' + currentUser.apiKey + '\')">Copy</button>' +
        '</span>' +
        '</div>';
      
      if (currentUser.userInfo) {
        const user = currentUser.userInfo;
        
        userDetailHTML += 
          '<div class="user-info-item">' +
          '<span class="user-info-label">User ID:</span>' +
          '<span class="user-info-value">' + (user.id || 'N/A') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Username:</span>' +
          '<span class="user-info-value">' + (user.username || 'N/A') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Full Name:</span>' +
          '<span class="user-info-value">' + (user.first_name || '') + ' ' + (user.last_name || '') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Telephone:</span>' +
          '<span class="user-info-value">' + (user.telephone || 'N/A') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Country:</span>' +
          '<span class="user-info-value">' + (user.country || 'N/A') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Zip Code:</span>' +
          '<span class="user-info-value">' + (user.zipcode || 'N/A') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Account Created:</span>' +
          '<span class="user-info-value">' + (user.created_on ? new Date(user.created_on).toLocaleString() : 'N/A') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Last Modified:</span>' +
          '<span class="user-info-value">' + (user.modified_on ? new Date(user.modified_on).toLocaleString() : 'N/A') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">2FA Enabled:</span>' +
          '<span class="user-info-value">' + (user.two_factor_authentication ? '✅ Yes' : '❌ No') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Account Status:</span>' +
          '<span class="user-info-value">' + (user.suspended ? '🔴 Suspended' : '🟢 Active') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Total Zones:</span>' +
          '<span class="user-info-value">' + (user.total_zone_count || '0') + '</span>' +
          '</div>';
        
        // Account Types
        userDetailHTML += '<div class="user-info-item">' +
          '<span class="user-info-label">Pro Zones:</span>' +
          '<span class="user-info-value">' + (user.has_pro_zones ? '✅ Yes' : '❌ No') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Business Zones:</span>' +
          '<span class="user-info-value">' + (user.has_business_zones ? '✅ Yes' : '❌ No') + '</span>' +
          '</div>' +
          '<div class="user-info-item">' +
          '<span class="user-info-label">Enterprise Zones:</span>' +
          '<span class="user-info-value">' + (user.has_enterprise_zones ? '✅ Yes' : '❌ No') + '</span>' +
          '</div>';
      }
      
      // Cloudflare Accounts
      if (currentUser.accounts && currentUser.accounts.length > 0) {
        userDetailHTML += '<h4 style="margin-top: 20px;">🏢 Cloudflare Accounts</h4>';
        
        currentUser.accounts.forEach(function(account, index) {
          userDetailHTML += 
            '<div style="background: #3d3d3d; padding: 15px; border-radius: 8px; margin: 10px 0;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">' +
            '<strong>' + account.name + '</strong>' +
            '<span class="account-badge">' + (account.detailed_info && account.detailed_info.type ? account.detailed_info.type : 'Standard') + '</span>' +
            '</div>' +
            
            '<div class="user-info-item">' +
            '<span class="user-info-label">Account ID:</span>' +
            '<span class="user-info-value">' + account.id + '</span>' +
            '</div>' +
            
            '<div class="user-info-item">' +
            '<span class="user-info-label">Settings:</span>' +
            '<span class="user-info-value">' + 
            (account.detailed_info && account.detailed_info.settings ? 
              Object.keys(account.detailed_info.settings).map(key => 
                key + ': ' + (account.detailed_info.settings[key] ? '✅' : '❌')
              ).join(', ') : 'Default settings') +
            '</span>' +
            '</div>';
          
          if (account.subscription) {
            userDetailHTML += 
              '<div class="user-info-item">' +
              '<span class="user-info-label">Subscription:</span>' +
              '<span class="user-info-value">' + account.subscription.rate_plan.name + ' ($' + (account.subscription.rate_plan.price / 100) + '/month)' + '</span>' +
              '</div>' +
              '<div class="user-info-item">' +
              '<span class="user-info-label">Status:</span>' +
              '<span class="user-info-value">' + account.subscription.state + '</span>' +
              '</div>';
          }
          
          userDetailHTML += 
            '<div class="user-info-item">' +
            '<span class="user-info-label">Members:</span>' +
            '<span class="user-info-value">' + account.member_count + ' total' + '</span>' +
            '</div>';
          
          // Show first few members
          if (account.members && account.members.length > 0) {
            userDetailHTML += '<div style="margin-top: 10px;">' +
              '<small><strong>Recent Members:</strong></small>' +
              '<div style="font-size: 12px; margin-top: 5px;">' +
              account.members.map(member => 
                '<div style="display: inline-block; background: #2d2d2d; padding: 2px 8px; border-radius: 10px; margin: 2px;">' +
                member.user_email +
                '</div>'
              ).join('') +
              '</div>' +
              '</div>';
          }
          
          userDetailHTML += '</div>';
        });
      }
      
      // Organizations
      if (currentUser.userInfo && currentUser.userInfo.organizations && currentUser.userInfo.organizations.length > 0) {
        userDetailHTML += '<h4 style="margin-top: 20px;">🏛️ Organizations</h4>';
        
        currentUser.userInfo.organizations.forEach(function(org) {
          userDetailHTML += 
            '<div style="background: #3d3d3d; padding: 10px; border-radius: 5px; margin: 5px 0;">' +
            '<strong>' + org.name + '</strong>' +
            '<div style="font-size: 12px; color: #ccc;">Role: ' + org.role + ' | Status: ' + org.status + '</div>' +
            '</div>';
        });
      }
      
      // Beta Features
      if (currentUser.userInfo && currentUser.userInfo.betas && currentUser.userInfo.betas.length > 0) {
        userDetailHTML += '<h4 style="margin-top: 20px;">🔬 Beta Features</h4>' +
          '<div style="display: flex; flex-wrap: wrap; gap: 5px;">' +
          currentUser.userInfo.betas.map(beta => 
            '<span style="background: #007bff; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px;">' + beta + '</span>'
          ).join('') +
          '</div>';
      }
      
      userDetailHTML += '</div>'; // Close scroll container
      
      userDetailContent.innerHTML = userDetailHTML;
      document.getElementById('userDetailModal').style.display = 'flex';
    }

    function hideUserDetailModal() {
      document.getElementById('userDetailModal').style.display = 'none';
    }

    function showAnalyticsModal() {
      // For demo purposes, we'll show random analytics data
      document.getElementById('totalRequests').textContent = (Math.floor(Math.random() * 10000) + 1000).toLocaleString();
      document.getElementById('successRate').textContent = (Math.floor(Math.random() * 20) + 80) + '%';
      document.getElementById('avgResponseTime').textContent = (Math.floor(Math.random() * 100) + 50) + 'ms';
      document.getElementById('cpuTime').textContent = (Math.floor(Math.random() * 100000) + 50000).toLocaleString() + 'ms';
      
      document.getElementById('p95Response').textContent = (Math.floor(Math.random() * 200) + 100) + 'ms';
      document.getElementById('p99Response').textContent = (Math.floor(Math.random() * 300) + 150) + 'ms';
      document.getElementById('cacheHitRate').textContent = (Math.floor(Math.random() * 40) + 60) + '%';
      
      document.getElementById('analyticsModal').style.display = 'flex';
    }

    function hideAnalyticsModal() {
      document.getElementById('analyticsModal').style.display = 'none';
    }

    function showExportConfig() {
      const configData = {
        users: users.map(function(user) {
          return {
            email: user.email,
            accountId: user.accountId,
            // Don't export API keys for security
          };
        }),
                workers: allWorkers.map(function(worker) {
          return {
            id: worker.id,
            account: worker.account,
            created_on: worker.created_on
          };
        }),
        export_date: new Date().toISOString(),
        version: '1.0'
      };
      
      document.getElementById('exportData').value = JSON.stringify(configData, null, 2);
      document.getElementById('configModal').style.display = 'flex';
    }

    function hideConfigModal() {
      document.getElementById('configModal').style.display = 'none';
    }

    function copyExportData() {
      const exportData = document.getElementById('exportData');
      exportData.select();
      document.execCommand('copy');
      showNotification('Configuration copied to clipboard!');
    }

    function downloadExportData() {
      const exportData = document.getElementById('exportData').value;
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cloudflare-workers-config-' + new Date().toISOString().split('T')[0] + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('Configuration downloaded!');
    }

    function importConfig() {
      const importData = document.getElementById('importData').value;
      
      if (!importData) {
        showNotification('Please paste configuration data or upload a file', 'error');
        return;
      }
      
      try {
        const configData = JSON.parse(importData);
        
        if (configData.users && Array.isArray(configData.users)) {
          // Import users configuration (without API keys for security)
          showNotification('Configuration imported successfully! Note: API keys need to be re-entered for security.');
          
          // Clear current data
          users = [];
          localStorage.removeItem('cf_users');
          localStorage.removeItem('cf_current_user');
          
          // Update UI
          updateUI();
          
          // Show login form to add accounts with new API keys
          document.getElementById('loginForm').style.display = 'block';
        } else {
          showNotification('Invalid configuration format', 'error');
        }
      } catch (error) {
        showNotification('Error parsing configuration: ' + error.message, 'error');
      }
    }

    function handleFileImport(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('importData').value = e.target.result;
      };
      reader.readAsText(file);
    }

    function switchTab(tabName) {
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(function(tabContent) {
        tabContent.classList.remove('active');
      });
      
      // Remove active class from all tabs
      document.querySelectorAll('.tab').forEach(function(tab) {
        tab.classList.remove('active');
      });
      
      // Show selected tab content
      document.getElementById(tabName + 'Tab').classList.add('active');
      
      // Activate selected tab
      document.querySelector('.tab[data-tab="' + tabName + '"]').classList.add('active');
    }

    function toggleAutoRefresh(enabled) {
      const statusElement = document.getElementById('autoRefreshStatus');
      
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }
      
      if (enabled) {
        const interval = parseInt(document.getElementById('autoRefreshInterval').value) * 1000;
        statusElement.textContent = 'On (' + (interval / 1000) + 's)';
        autoRefreshInterval = setInterval(fetchAllWorkers, interval);
      } else {
        statusElement.textContent = 'Off';
      }
    }

    function showWorkerAnalytics(workerName, accountEmail) {
      // For demo purposes, show analytics modal with random data
      showAnalyticsModal();
    }

    function showNotification(message, type = 'success') {
      const notification = document.getElementById('notification');
      notification.textContent = message;
      notification.className = 'notification ' + (type === 'error' ? 'error' : type === 'warning' ? 'warning' : '');
      notification.style.display = 'block';
      
      setTimeout(function() {
        notification.style.display = 'none';
      }, 5000);
    }

    // Utility function untuk copy ke clipboard (global)
    window.copyToClipboard = function(text) {
      navigator.clipboard.writeText(text).then(function() {
        showNotification('Copied to clipboard!');
      });
    };

    // Global functions untuk event handlers
    window.toggleWorkerSelection = toggleWorkerSelection;
    window.viewWorkerConfig = viewWorkerConfig;
    window.editWorker = editWorker;
    window.showWorkerAnalytics = showWorkerAnalytics;
    window.deleteWorker = deleteWorker;
    window.showBulkActionsModal = showBulkActionsModal;
    window.bulkDeleteWorkers = bulkDeleteWorkers;
    window.switchUser = switchUser;
    window.logoutUser = logoutUser;
    window.copyToClipboard = copyToClipboard;
  </script>
</body>
</html>
